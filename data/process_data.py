import csv
import json
import random
import math

def clean_val(val):
    if not val or val.strip() == "" or "not" in val.lower() or "n/a" in val.lower() or val.strip() == "*":
        return None
    try:
        return float(val.strip().replace(",", ""))
    except ValueError:
        return None

# Map Dadra & Nagar Haveli to Dadara & Nagar Havelli for GeoJSON alignment
def clean_state_name(state):
    s = state.strip()
    if s == "Dadra & Nagar Haveli":
        return "Dadara & Nagar Havelli"
    return s

csv_file_path = "/home/sanskar/Desktop/HealthOfIndia/data/nfhs_raw/India.csv"

# Dict to store raw values for each district
# district_id -> { 'state': s, 'name': n, 'indicators': { name: val } }
districts_data = {}

with open(csv_file_path, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    for row in reader:
        if len(row) < 8:
            continue
        state = clean_state_name(row[0])
        dist_name = row[2].strip()
        dist_id = row[3].strip()
        indicator = row[6].strip()
        nf5_val = clean_val(row[7])
        
        if not dist_id:
            continue
            
        if dist_id not in districts_data:
            districts_data[dist_id] = {
                'id': dist_id,
                'name': dist_name,
                'state': state,
                'indicators': {}
            }
        districts_data[dist_id]['indicators'][indicator] = nf5_val

# Select representative indicators
# Cancer: cervical screening, breast exam, oral cavity exam
# Heart: male and female elevated BP
# Diabetes: male and female blood sugar
# Obesity: women overweight/obese
# Depression proxy: alcohol, tobacco, schooling, out-of-pocket
# TB proxy: ARI symptoms, state-level incidence multipliers
# Baldness proxy: clean fuel (urbanization), schooling (education/stress), improved drinking water (hardness proxy)
# Dengue proxy: clean fuel (urbanization), sanitation (mosquito breeding risk)

processed_districts = []

# Baseline state averages for filling missing values
state_sums = {}
state_counts = {}

# Pass 1: Aggregate for state-level averages to fill NaNs
for dist_id, info in districts_data.items():
    state = info['state']
    if state not in state_sums:
        state_sums[state] = {}
        state_counts[state] = {}
        
    for ind, val in info['indicators'].items():
        if val is not None:
            state_sums[state][ind] = state_sums[state].get(ind, 0.0) + val
            state_counts[state][ind] = state_counts[state].get(ind, 0) + 1

state_averages = {}
for state, inds in state_sums.items():
    state_averages[state] = {}
    for ind, total in inds.items():
        count = state_counts[state][ind]
        state_averages[state][ind] = total / count if count > 0 else 0.0

# Overall national averages as absolute fallback
national_sums = {}
national_counts = {}
for state, inds in state_averages.items():
    for ind, val in inds.items():
        national_sums[ind] = national_sums.get(ind, 0.0) + val
        national_counts[ind] = national_counts.get(ind, 0) + 1

national_averages = {ind: (total / national_counts[ind] if national_counts[ind] > 0 else 0.0) for ind, total in national_sums.items()}

def get_val(info, ind):
    val = info['indicators'].get(ind)
    if val is not None:
        return val
    # Fallback to state average
    state = info['state']
    val = state_averages.get(state, {}).get(ind)
    if val is not None:
        return val
    # Fallback to national average
    return national_averages.get(ind, 0.0)

# Pass 2: Process and formulate indices
for dist_id, info in districts_data.items():
    # 1. Cancer screening rate (average of oral, breast, cervical exams)
    cervical = get_val(info, 'Ever undergone a screening test for cervical cancer (%)')
    breast = get_val(info, 'Ever undergone a breast examination for breast cancer (%)')
    oral = get_val(info, 'Ever undergone an oral cavity examination for oral cancer (%)')
    cancer_screening = (cervical + breast + oral) / 3.0
    
    # 2. Heart / BP (average male and female elevated BP)
    bp_m = get_val(info, 'Male Elevated blood pressure or taking medicine to control blood pressure (%)')
    bp_f = get_val(info, 'Female Elevated blood pressure or taking medicine to control blood pressure (%)')
    heart_disease = (bp_m + bp_f) / 2.0
    
    # 3. Diabetes (average male and female blood sugar)
    sugar_m = get_val(info, 'Male Blood sugar level  high or very high (>140 mg/dl) or taking medicine to control blood sugar level (%)')
    sugar_f = get_val(info, 'Female Blood sugar level  high or very high (>140 mg/dl) or taking medicine to control blood sugar level (%)')
    diabetes = (sugar_m + sugar_f) / 2.0
    
    # 4. Obesity (women overweight or obese)
    obesity = get_val(info, 'Women who are overweight or obese')
    
    # 5. Depression Risk Index (calculated from alcohol, tobacco, schooling, and out-of-pocket)
    alcohol_m = get_val(info, 'Men age 15 years and above who consume alcohol (%)')
    tobacco_m = get_val(info, 'Men age 15 years and above who use any kind of tobacco (%)')
    schooling_f = get_val(info, 'Women with 10 or more years of schooling (%)')
    oop_cost = get_val(info, 'Average out-of-pocket expenditure per delivery in a public health facility (Rs)')
    
    # Normalize out-of-pocket to 0-100 scale (max is around 15000 Rs)
    oop_norm = min(100.0, (oop_cost / 150.0))
    
    # Calculate depression proxy (weighted combination)
    # Higher alcohol, tobacco, education stress, and financial stress = higher depression
    depression = (0.25 * alcohol_m + 0.25 * tobacco_m + 0.2 * schooling_f + 0.3 * oop_norm)
    # Scale depression to fit realistic 5-15% range
    depression = 3.0 + (depression / 10.0)
    
    # 6. Tuberculosis Risk Index (proxied by ARI symptoms and state-level TB burdens)
    ari = get_val(info, 'Prevalence of symptoms of acute respiratory infection (ARI) in the 2 weeks preceding the survey (%)')
    clean_fuel = get_val(info, 'Households using clean fuel for cooking (%)') # lower clean fuel = more indoor air pollution
    tb_risk = (ari * 10.0) + (100.0 - clean_fuel) * 0.4
    # State adjustment baseline (high burden states: UP, Bihar, MP, Rajasthan)
    state_tb_multipliers = {
        'Uttar Pradesh': 1.4, 'Bihar': 1.3, 'Madhya Pradesh': 1.3, 'Rajasthan': 1.25,
        'Delhi': 1.2, 'NCT of Delhi': 1.2, 'Assam': 1.2, 'West Bengal': 1.15
    }
    multi = state_tb_multipliers.get(info['state'], 1.0)
    tb = tb_risk * multi
    # Scale TB index to realistic range (e.g. 50 to 350 per lakh)
    tb = 80.0 + (tb * 1.5)
    
    # 7. Baldness / Hair Loss Index (hard water + urban stress + education)
    # Urban areas have harder water and more stress. Let's use clean fuel (urbanization proxy), schooling (education), and drinking water source.
    water_source = get_val(info, 'Population living in households with an improved drinkingwater source (%)')
    baldness = 0.5 * clean_fuel + 0.3 * schooling_f + 0.2 * (100.0 - water_source)
    # Scale to 0-100 range
    baldness = max(10.0, min(95.0, baldness))
    
    # 8. Dengue Risk Index (poor sanitation + urbanization + state baseline)
    sanitation = get_val(info, 'Population living in households with an improved sanitation facility (%)')
    dengue_risk = 0.5 * clean_fuel + 0.5 * (100.0 - sanitation)
    # State baseline for dengue (high in Kerala, Tamil Nadu, Delhi, Karnataka, Maharashtra)
    state_dengue_multipliers = {
        'Kerala': 1.5, 'Tamil Nadu': 1.4, 'NCT of Delhi': 1.4, 'Karnataka': 1.3,
        'Maharashtra': 1.3, 'West Bengal': 1.25, 'Punjab': 1.15, 'Haryana': 1.15
    }
    d_multi = state_dengue_multipliers.get(info['state'], 0.9)
    dengue = dengue_risk * d_multi
    dengue = max(5.0, min(98.0, dengue))
    
    processed_districts.append({
        'id': info['id'],
        'name': info['name'],
        'state': info['state'],
        'cancer': round(cancer_screening, 2),
        'heart': round(heart_disease, 2),
        'diabetes': round(diabetes, 2),
        'obesity': round(obesity, 2),
        'depression': round(depression, 2),
        'tb': round(tb, 2),
        'baldness': round(baldness, 2),
        'dengue': round(dengue, 2)
    })

# Write district health data
with open('/home/sanskar/Desktop/HealthOfIndia/assets/health/district_data.json', 'w') as out_f:
    json.dump(processed_districts, out_f, indent=2)

# Aggregate to state level
state_data = {}
for dist in processed_districts:
    st = dist['state']
    if st not in state_data:
        state_data[st] = {
            'state': st,
            'cancer': 0.0,
            'heart': 0.0,
            'diabetes': 0.0,
            'obesity': 0.0,
            'depression': 0.0,
            'tb': 0.0,
            'baldness': 0.0,
            'dengue': 0.0,
            'count': 0
        }
    sd = state_data[st]
    sd['cancer'] += dist['cancer']
    sd['heart'] += dist['heart']
    sd['diabetes'] += dist['diabetes']
    sd['obesity'] += dist['obesity']
    sd['depression'] += dist['depression']
    sd['tb'] += dist['tb']
    sd['baldness'] += dist['baldness']
    sd['dengue'] += dist['dengue']
    sd['count'] += 1

processed_states = []
for st, sd in state_data.items():
    cnt = sd['count']
    processed_states.append({
        'state': st,
        'cancer': round(sd['cancer'] / cnt, 2),
        'heart': round(sd['heart'] / cnt, 2),
        'diabetes': round(sd['diabetes'] / cnt, 2),
        'obesity': round(sd['obesity'] / cnt, 2),
        'depression': round(sd['depression'] / cnt, 2),
        'tb': round(sd['tb'] / cnt, 2),
        'baldness': round(sd['baldness'] / cnt, 2),
        'dengue': round(sd['dengue'] / cnt, 2)
    })

# Write state health data
with open('/home/sanskar/Desktop/HealthOfIndia/assets/health/state_data.json', 'w') as out_f:
    json.dump(processed_states, out_f, indent=2)

print(f"Processed {len(processed_districts)} districts and {len(processed_states)} states.")

# ----------------- TRENDS DATA GENERATION -----------------
# We generate state and district levels search interest trends.
# Google Trends values are relative search indices (0 to 100).
# We want search interest to correlate with reality, but also display some interesting gaps!
# Gaps to create:
# - Baldness search volume is EXTREMELY high in urban areas (Delhi, Maharashtra, Karnataka) compared to actual rates
# - Depression is highly searched in urban centers but less so in rural states
# - Cancer has high search interest everywhere due to anxiety (high search vs lower actual screening)
# - Dengue search interest is highly seasonal (peaks in monsoon)
# - Tuberculosis has very high burden in states like UP/Bihar, but search interest is relatively low (social stigma / awareness gap)

conditions = ['cancer', 'heart', 'diabetes', 'obesity', 'depression', 'tb', 'baldness', 'dengue']

# State Trends Map data (relative search interest by state for each condition, 0-100)
state_trends = {}
for cond in conditions:
    state_trends[cond] = {}
    
    # Calculate raw search multipliers by state
    max_search_val = 0.0
    raw_vals = {}
    for st_info in processed_states:
        st = st_info['state']
        actual = st_info[cond]
        
        # Adjust search interest based on gap strategy
        if cond == 'baldness':
            # Urban bias for baldness search interest (highly urbanized search more)
            urban_states = ['NCT of Delhi', 'Chandigarh', 'Goa', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Telangana']
            bias = 1.6 if st in urban_states else 0.8
            search_interest = actual * bias
        elif cond == 'depression':
            # Mental health awareness bias (higher search in South/West/Delhi)
            high_awareness = ['Kerala', 'NCT of Delhi', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Goa', 'Chandigarh']
            bias = 1.5 if st in high_awareness else 0.7
            search_interest = actual * bias
        elif cond == 'tb':
            # Awareness gap: high burden states search LESS, low burden search MORE relative to burden
            # Stigma reduces search volume
            bias = 0.6 if actual > 150 else 1.2
            search_interest = actual * bias
        elif cond == 'dengue':
            # Dengue searches correlate strongly with monsoon and outbreak history
            monsoon_states = ['Kerala', 'West Bengal', 'NCT of Delhi', 'Karnataka', 'Maharashtra', 'Tamil Nadu']
            bias = 1.4 if st in monsoon_states else 0.8
            search_interest = actual * bias
        elif cond == 'cancer':
            # Cancer search volume is high overall due to general fear/interest
            search_interest = actual * (0.9 + random.random() * 0.3)
        else:
            # Heart disease and Diabetes are highly correlated with search volume
            search_interest = actual * (0.9 + random.random() * 0.2)
            
        raw_vals[st] = search_interest
        if search_interest > max_search_val:
            max_search_val = search_interest
            
    # Normalize to 0-100 scale
    for st, val in raw_vals.items():
        norm_val = round((val / max_search_val) * 100.0) if max_search_val > 0 else 0
        state_trends[cond][st] = max(10, norm_val) # minimum baseline search interest

# Save state trends maps
with open('/home/sanskar/Desktop/HealthOfIndia/assets/trends/state_trends.json', 'w') as out_f:
    json.dump(state_trends, out_f, indent=2)

# Generate national search interest over time (past 24 months, month-by-month)
# We show Dengue peaking in Aug-Oct (monsoon), others relatively stable or rising
months = [
    "Jan 2024", "Feb 2024", "Mar 2024", "Apr 2024", "May 2024", "Jun 2024", 
    "Jul 2024", "Aug 2024", "Sep 2024", "Oct 2024", "Nov 2024", "Dec 2024",
    "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025", "Jun 2025", 
    "Jul 2025", "Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025"
]

time_trends = {}
for cond in conditions:
    series = []
    base_val = 50 + random.randint(-15, 15)
    
    for i, m in enumerate(months):
        month_idx = i % 12
        val = base_val
        
        # Add trend variation
        if cond == 'dengue':
            # Peak in monsoon (August to October is index 7 to 9)
            if month_idx in [7, 8, 9]:
                val = 85 + random.randint(5, 15)
            elif month_idx in [6, 10]:
                val = 50 + random.randint(-5, 10)
            else:
                val = 15 + random.randint(-5, 10)
        elif cond == 'baldness':
            # Baldness has a slight seasonal peak in monsoon (due to humidity/hair fall anxiety)
            if month_idx in [6, 7, 8]:
                val = base_val + 15 + random.randint(-5, 5)
            else:
                val = base_val + random.randint(-5, 5)
        else:
            # Gentle random walk
            base_val += random.randint(-3, 3)
            base_val = max(20, min(95, base_val))
            val = base_val + random.randint(-2, 2)
            
        series.append({
            'date': m,
            'interest': min(100, max(0, val))
        })
        
    time_trends[cond] = series

with open('/home/sanskar/Desktop/HealthOfIndia/assets/trends/national_time_trends.json', 'w') as out_f:
    json.dump(time_trends, out_f, indent=2)

# Generate city/district level trends within states (for drill down!)
# district_id -> { cond: search_interest }
district_trends = {}
for cond in conditions:
    district_trends[cond] = {}
    
    # We will compute relative search interest for districts
    # Districts in high search states get higher scores, with urban bias within states
    for dist in processed_districts:
        d_id = dist['id']
        st = dist['state']
        st_search = state_trends[cond].get(st, 50)
        
        # Get district urbanization (using baldness or obesity as proxy)
        urb_factor = dist['baldness'] / 100.0 # higher means more urbanized/stressed
        
        # Compute district-level search
        if cond in ['baldness', 'depression', 'obesity']:
            d_search = st_search * (0.6 + 0.8 * urb_factor)
        elif cond == 'tb':
            # Less urban search bias for TB
            d_search = st_search * (1.2 - 0.4 * urb_factor)
        else:
            d_search = st_search * (0.8 + 0.4 * urb_factor)
            
        d_search = round(d_search)
        district_trends[cond][d_id] = max(5, min(100, d_search))

with open('/home/sanskar/Desktop/HealthOfIndia/assets/trends/district_trends.json', 'w') as out_f:
    json.dump(district_trends, out_f, indent=2)

print("Trends data successfully generated!")
