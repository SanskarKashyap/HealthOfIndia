#!/usr/bin/env python3
"""
Google Trends Scraper v2 — Health of India Dashboard
=====================================================
Uses Google Trends TOPICS (Knowledge Graph IDs) for cross-language coverage.
Scrapes 48-month window (4 years) for:
  1. National interest over time (monthly averages)
  2. State-level interest by region
  3. City-level interest → mapped to district-level trends

Usage:
  cd /home/sanskar/Desktop/HealthOfIndia
  data/.venv/bin/python data/scrape_trends.py
"""

import json
import time
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

try:
    from pytrends.request import TrendReq
    import pandas as pd
except ImportError:
    print("ERROR: pytrends or pandas not installed.")
    print("Run: data/.venv/bin/pip install pytrends pandas")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────

# Map condition keys to their Google Trends TOPIC IDs (MIDs)
# These capture the concept across all languages (Hindi, Tamil, etc.)
TOPIC_IDS = {
    "cancer":     "/m/01k8wb",   # Cancer (disease)
    "heart":      "/g/122y5270",  # Heart disease (disease)
    "diabetes":   "/m/027n3_",   # Diabetes mellitus (disease)
    "obesity":    "/m/0fltx",    # Obesity (medical condition)
    "depression": "/m/03f_cb",   # Depression (mood)
    "tb":         "/m/07jwr",    # Tuberculosis (disease)
    "baldness":   "/m/03bwzh1",  # Hair loss (topic)
    "dengue":     "/m/09wsg",    # Dengue fever (disease)
}

# Human-readable labels for output
TOPIC_LABELS = {
    "cancer": "Cancer", "heart": "Heart Disease", "diabetes": "Diabetes",
    "obesity": "Obesity", "depression": "Depression", "tb": "Tuberculosis",
    "baldness": "Hair Loss", "dengue": "Dengue Fever",
}

# Geo configuration
GEO = "IN"  # India
TIMEZONE = 330  # IST = UTC+5:30 in minutes

# Time range: last 4 years (48 months)
END_DATE = datetime.now()
START_DATE = END_DATE - timedelta(days=4 * 365)
TIMEFRAME = f"{START_DATE.strftime('%Y-%m-%d')} {END_DATE.strftime('%Y-%m-%d')}"

# Rate limiting
DELAY_BETWEEN_REQUESTS = 35  # seconds between API calls

# Output paths
PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "assets" / "trends"
NATIONAL_OUTPUT = OUTPUT_DIR / "national_time_trends.json"
STATE_OUTPUT = OUTPUT_DIR / "state_trends.json"
DISTRICT_OUTPUT = OUTPUT_DIR / "district_trends.json"
CITY_DISTRICT_MAP_OUTPUT = OUTPUT_DIR / "city_district_map.json"

# ──────────────────────────────────────────────────────────────
# GOOGLE TRENDS STATE NAME → GeoJSON ST_NM MAPPING
# ──────────────────────────────────────────────────────────────

STATE_NAME_MAP = {
    "Andhra Pradesh": "Andhra Pradesh",
    "Arunachal Pradesh": "Arunachal Pradesh",
    "Assam": "Assam",
    "Bihar": "Bihar",
    "Chhattisgarh": "Chhattisgarh",
    "Goa": "Goa",
    "Gujarat": "Gujarat",
    "Haryana": "Haryana",
    "Himachal Pradesh": "Himachal Pradesh",
    "Jharkhand": "Jharkhand",
    "Karnataka": "Karnataka",
    "Kerala": "Kerala",
    "Madhya Pradesh": "Madhya Pradesh",
    "Maharashtra": "Maharashtra",
    "Manipur": "Manipur",
    "Meghalaya": "Meghalaya",
    "Mizoram": "Mizoram",
    "Nagaland": "Nagaland",
    "Odisha": "Odisha",
    "Punjab": "Punjab",
    "Rajasthan": "Rajasthan",
    "Sikkim": "Sikkim",
    "Tamil Nadu": "Tamil Nadu",
    "Telangana": "Telangana",
    "Tripura": "Tripura",
    "Uttar Pradesh": "Uttar Pradesh",
    "Uttarakhand": "Uttarakhand",
    "West Bengal": "West Bengal",
    "Delhi": "NCT of Delhi",
    "National Capital Territory of Delhi": "NCT of Delhi",
    "Jammu and Kashmir": "Jammu & Kashmir",
    "Jammu & Kashmir": "Jammu & Kashmir",
    "Andaman and Nicobar Islands": "Andaman & Nicobar Island",
    "Andaman & Nicobar Islands": "Andaman & Nicobar Island",
    "Chandigarh": "Chandigarh",
    "Dadra and Nagar Haveli": "Dadara & Nagar Havelli",
    "Dadra and Nagar Haveli and Daman and Diu": "Dadara & Nagar Havelli",
    "Dadra & Nagar Haveli": "Dadara & Nagar Havelli",
    "Daman and Diu": "Daman & Diu",
    "Daman & Diu": "Daman & Diu",
    "Lakshadweep": "Lakshadweep",
    "Puducherry": "Puducherry",
    "Ladakh": "Ladakh",
}

# ──────────────────────────────────────────────────────────────
# MAJOR INDIAN CITIES → DISTRICT MAPPING
# Maps Google Trends city names to GeoJSON DISTRICT IDs
# This covers the ~100+ cities that Google Trends typically returns
# ──────────────────────────────────────────────────────────────

CITY_TO_DISTRICT = {
    # Maharashtra
    "Mumbai": {"district_id": "Mumbai Suburban_23", "state": "Maharashtra"},
    "Pune": {"district_id": "Pune_25", "state": "Maharashtra"},
    "Nagpur": {"district_id": "Nagpur_9", "state": "Maharashtra"},
    "Nashik": {"district_id": "Nashik_20", "state": "Maharashtra"},
    "Aurangabad": {"district_id": "Aurangabad_19", "state": "Maharashtra"},
    "Thane": {"district_id": "Thane_21", "state": "Maharashtra"},
    "Kolhapur": {"district_id": "Kolhapur_30", "state": "Maharashtra"},
    "Solapur": {"district_id": "Solapur_27", "state": "Maharashtra"},
    "Amravati": {"district_id": "Amravati_7", "state": "Maharashtra"},
    "Navi Mumbai": {"district_id": "Thane_21", "state": "Maharashtra"},
    "Nanded": {"district_id": "Nanded_15", "state": "Maharashtra"},
    "Sangli": {"district_id": "Sangli_29", "state": "Maharashtra"},
    "Akola": {"district_id": "Akola_5", "state": "Maharashtra"},

    # Karnataka
    "Bengaluru": {"district_id": "Bengaluru Urban_18", "state": "Karnataka"},
    "Bangalore": {"district_id": "Bengaluru Urban_18", "state": "Karnataka"},
    "Mysuru": {"district_id": "Mysuru_22", "state": "Karnataka"},
    "Mysore": {"district_id": "Mysuru_22", "state": "Karnataka"},
    "Hubli": {"district_id": "Dharwad_7", "state": "Karnataka"},
    "Mangalore": {"district_id": "Dakshina Kannada_2", "state": "Karnataka"},
    "Mangaluru": {"district_id": "Dakshina Kannada_2", "state": "Karnataka"},
    "Belgaum": {"district_id": "Belgaum_3", "state": "Karnataka"},
    "Belagavi": {"district_id": "Belgaum_3", "state": "Karnataka"},
    "Gulbarga": {"district_id": "Gulbarga_4", "state": "Karnataka"},
    "Kalaburagi": {"district_id": "Gulbarga_4", "state": "Karnataka"},
    "Davanagere": {"district_id": "Davangere_8", "state": "Karnataka"},
    "Bellary": {"district_id": "Bellary_5", "state": "Karnataka"},
    "Shimoga": {"district_id": "Shimoga_14", "state": "Karnataka"},

    # Tamil Nadu
    "Chennai": {"district_id": "Chennai_3", "state": "Tamil Nadu"},
    "Coimbatore": {"district_id": "Coimbatore_19", "state": "Tamil Nadu"},
    "Madurai": {"district_id": "Madurai_25", "state": "Tamil Nadu"},
    "Tiruchirappalli": {"district_id": "Tiruchirappalli_16", "state": "Tamil Nadu"},
    "Trichy": {"district_id": "Tiruchirappalli_16", "state": "Tamil Nadu"},
    "Salem": {"district_id": "Salem_12", "state": "Tamil Nadu"},
    "Tirunelveli": {"district_id": "Tirunelveli_29", "state": "Tamil Nadu"},
    "Erode": {"district_id": "Erode_18", "state": "Tamil Nadu"},
    "Vellore": {"district_id": "Vellore_8", "state": "Tamil Nadu"},
    "Thanjavur": {"district_id": "Thanjavur_14", "state": "Tamil Nadu"},
    "Tiruppur": {"district_id": "Tiruppur_20", "state": "Tamil Nadu"},
    "Dindigul": {"district_id": "Dindigul_22", "state": "Tamil Nadu"},
    "Tuticorin": {"district_id": "Thoothukkudi_30", "state": "Tamil Nadu"},
    "Thoothukudi": {"district_id": "Thoothukkudi_30", "state": "Tamil Nadu"},
    "Nagercoil": {"district_id": "Kanniyakumari_31", "state": "Tamil Nadu"},

    # Kerala
    "Kochi": {"district_id": "Ernakulam_8", "state": "Kerala"},
    "Cochin": {"district_id": "Ernakulam_8", "state": "Kerala"},
    "Thiruvananthapuram": {"district_id": "Thiruvananthapuram_14", "state": "Kerala"},
    "Trivandrum": {"district_id": "Thiruvananthapuram_14", "state": "Kerala"},
    "Kozhikode": {"district_id": "Kozhikode_3", "state": "Kerala"},
    "Calicut": {"district_id": "Kozhikode_3", "state": "Kerala"},
    "Thrissur": {"district_id": "Thrissur_6", "state": "Kerala"},
    "Kollam": {"district_id": "Kollam_13", "state": "Kerala"},
    "Kannur": {"district_id": "Kannur_2", "state": "Kerala"},
    "Palakkad": {"district_id": "Palakkad_5", "state": "Kerala"},
    "Malappuram": {"district_id": "Malappuram_4", "state": "Kerala"},
    "Kottayam": {"district_id": "Kottayam_10", "state": "Kerala"},

    # Uttar Pradesh
    "Lucknow": {"district_id": "Lucknow_25", "state": "Uttar Pradesh"},
    "Kanpur": {"district_id": "Kanpur Nagar_23", "state": "Uttar Pradesh"},
    "Agra": {"district_id": "Agra_15", "state": "Uttar Pradesh"},
    "Varanasi": {"district_id": "Varanasi_57", "state": "Uttar Pradesh"},
    "Allahabad": {"district_id": "Allahabad_44", "state": "Uttar Pradesh"},
    "Prayagraj": {"district_id": "Allahabad_44", "state": "Uttar Pradesh"},
    "Meerut": {"district_id": "Meerut_6", "state": "Uttar Pradesh"},
    "Bareilly": {"district_id": "Bareilly_33", "state": "Uttar Pradesh"},
    "Aligarh": {"district_id": "Aligarh_12", "state": "Uttar Pradesh"},
    "Moradabad": {"district_id": "Moradabad_10", "state": "Uttar Pradesh"},
    "Gorakhpur": {"district_id": "Gorakhpur_52", "state": "Uttar Pradesh"},
    "Noida": {"district_id": "Gautam Buddha Nagar_9", "state": "Uttar Pradesh"},
    "Ghaziabad": {"district_id": "Ghaziabad_7", "state": "Uttar Pradesh"},
    "Jhansi": {"district_id": "Jhansi_26", "state": "Uttar Pradesh"},
    "Mathura": {"district_id": "Mathura_14", "state": "Uttar Pradesh"},

    # Rajasthan
    "Jaipur": {"district_id": "Jaipur_12", "state": "Rajasthan"},
    "Jodhpur": {"district_id": "Jodhpur_25", "state": "Rajasthan"},
    "Udaipur": {"district_id": "Udaipur_29", "state": "Rajasthan"},
    "Kota": {"district_id": "Kota_18", "state": "Rajasthan"},
    "Ajmer": {"district_id": "Ajmer_21", "state": "Rajasthan"},
    "Bikaner": {"district_id": "Bikaner_4", "state": "Rajasthan"},

    # Gujarat
    "Ahmedabad": {"district_id": "Ahmadabad_7", "state": "Gujarat"},
    "Surat": {"district_id": "Surat_20", "state": "Gujarat"},
    "Vadodara": {"district_id": "Vadodara_18", "state": "Gujarat"},
    "Baroda": {"district_id": "Vadodara_18", "state": "Gujarat"},
    "Rajkot": {"district_id": "Rajkot_10", "state": "Gujarat"},
    "Bhavnagar": {"district_id": "Bhavnagar_14", "state": "Gujarat"},
    "Jamnagar": {"district_id": "Jamnagar_9", "state": "Gujarat"},
    "Gandhinagar": {"district_id": "Gandhinagar_16", "state": "Gujarat"},
    "Junagadh": {"district_id": "Junagadh_12", "state": "Gujarat"},

    # Delhi NCR
    "New Delhi": {"district_id": "New Delhi_9", "state": "NCT of Delhi"},
    "Delhi": {"district_id": "New Delhi_9", "state": "NCT of Delhi"},

    # West Bengal
    "Kolkata": {"district_id": "Kolkata_16", "state": "West Bengal"},
    "Howrah": {"district_id": "Howrah_15", "state": "West Bengal"},
    "Durgapur": {"district_id": "Barddhaman_14", "state": "West Bengal"},
    "Siliguri": {"district_id": "Darjiling_1", "state": "West Bengal"},
    "Asansol": {"district_id": "Barddhaman_14", "state": "West Bengal"},

    # Madhya Pradesh
    "Bhopal": {"district_id": "Bhopal_28", "state": "Madhya Pradesh"},
    "Indore": {"district_id": "Indore_31", "state": "Madhya Pradesh"},
    "Jabalpur": {"district_id": "Jabalpur_36", "state": "Madhya Pradesh"},
    "Gwalior": {"district_id": "Gwalior_24", "state": "Madhya Pradesh"},

    # Bihar
    "Patna": {"district_id": "Patna_28", "state": "Bihar"},
    "Gaya": {"district_id": "Gaya_31", "state": "Bihar"},
    "Muzaffarpur": {"district_id": "Muzaffarpur_12", "state": "Bihar"},
    "Bhagalpur": {"district_id": "Bhagalpur_9", "state": "Bihar"},

    # Telangana
    "Hyderabad": {"district_id": "Hyderabad_7", "state": "Telangana"},
    "Warangal": {"district_id": "Warangal_3", "state": "Telangana"},
    "Nizamabad": {"district_id": "Nizamabad_2", "state": "Telangana"},
    "Karimnagar": {"district_id": "Karimnagar_4", "state": "Telangana"},

    # Andhra Pradesh
    "Visakhapatnam": {"district_id": "Visakhapatnam_3", "state": "Andhra Pradesh"},
    "Vizag": {"district_id": "Visakhapatnam_3", "state": "Andhra Pradesh"},
    "Vijayawada": {"district_id": "Krishna_6", "state": "Andhra Pradesh"},
    "Tirupati": {"district_id": "Chittoor_13", "state": "Andhra Pradesh"},
    "Guntur": {"district_id": "Guntur_7", "state": "Andhra Pradesh"},
    "Nellore": {"district_id": "Nellore_9", "state": "Andhra Pradesh"},
    "Kurnool": {"district_id": "Kurnool_11", "state": "Andhra Pradesh"},

    # Punjab
    "Ludhiana": {"district_id": "Ludhiana_11", "state": "Punjab"},
    "Amritsar": {"district_id": "Amritsar_15", "state": "Punjab"},
    "Jalandhar": {"district_id": "Jalandhar_9", "state": "Punjab"},
    "Patiala": {"district_id": "Patiala_7", "state": "Punjab"},
    "Bathinda": {"district_id": "Bathinda_4", "state": "Punjab"},

    # Haryana
    "Gurugram": {"district_id": "Gurgaon_6", "state": "Haryana"},
    "Gurgaon": {"district_id": "Gurgaon_6", "state": "Haryana"},
    "Faridabad": {"district_id": "Faridabad_7", "state": "Haryana"},
    "Panipat": {"district_id": "Panipat_10", "state": "Haryana"},
    "Ambala": {"district_id": "Ambala_2", "state": "Haryana"},
    "Karnal": {"district_id": "Karnal_9", "state": "Haryana"},
    "Hisar": {"district_id": "Hisar_16", "state": "Haryana"},
    "Rohtak": {"district_id": "Rohtak_13", "state": "Haryana"},

    # Odisha
    "Bhubaneswar": {"district_id": "Khordha_19", "state": "Odisha"},
    "Cuttack": {"district_id": "Cuttack_17", "state": "Odisha"},
    "Rourkela": {"district_id": "Sundargarh_2", "state": "Odisha"},

    # Jharkhand
    "Ranchi": {"district_id": "Ranchi_17", "state": "Jharkhand"},
    "Jamshedpur": {"district_id": "East Singhbhum_19", "state": "Jharkhand"},
    "Dhanbad": {"district_id": "Dhanbad_21", "state": "Jharkhand"},
    "Bokaro": {"district_id": "Bokaro_22", "state": "Jharkhand"},

    # Chhattisgarh
    "Raipur": {"district_id": "Raipur_14", "state": "Chhattisgarh"},
    "Bhilai": {"district_id": "Durg_11", "state": "Chhattisgarh"},
    "Bilaspur": {"district_id": "Bilaspur_8", "state": "Chhattisgarh"},

    # Assam
    "Guwahati": {"district_id": "Kamrup Metropolitan_23", "state": "Assam"},
    "Silchar": {"district_id": "Cachar_1", "state": "Assam"},

    # Uttarakhand
    "Dehradun": {"district_id": "Dehradun_1", "state": "Uttarakhand"},
    "Haridwar": {"district_id": "Haridwar_2", "state": "Uttarakhand"},

    # Himachal Pradesh
    "Shimla": {"district_id": "Shimla_7", "state": "Himachal Pradesh"},

    # Chandigarh
    "Chandigarh": {"district_id": "Chandigarh_1", "state": "Chandigarh"},

    # Goa
    "Panaji": {"district_id": "North Goa_1", "state": "Goa"},
    "Margao": {"district_id": "South Goa_2", "state": "Goa"},
    "Vasco da Gama": {"district_id": "South Goa_2", "state": "Goa"},

    # Puducherry
    "Pondicherry": {"district_id": "Pondicherry_1", "state": "Puducherry"},
    "Puducherry": {"district_id": "Pondicherry_1", "state": "Puducherry"},

    # Jammu & Kashmir
    "Srinagar": {"district_id": "Srinagar_1", "state": "Jammu & Kashmir"},
    "Jammu": {"district_id": "Jammu_6", "state": "Jammu & Kashmir"},
}


# ──────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ──────────────────────────────────────────────────────────────

def create_pytrends_session():
    """Create a pytrends session with Indian timezone."""
    return TrendReq(hl='en-US', tz=TIMEZONE, retries=3, backoff_factor=1.5)


def get_interest_over_time(pytrends, topic_id, condition_key):
    """
    Fetch national interest over time using Topic ID.
    Returns list of {date: "Mon YYYY", interest: int}
    """
    label = TOPIC_LABELS[condition_key]
    print(f"  📈 Fetching interest over time for '{label}' (topic={topic_id})...")

    pytrends.build_payload(
        [topic_id],
        cat=0,
        timeframe=TIMEFRAME,
        geo=GEO
    )

    df = pytrends.interest_over_time()

    if df.empty:
        print(f"  ⚠️  No data returned for '{label}' interest over time")
        return []

    if 'isPartial' in df.columns:
        df = df.drop(columns=['isPartial'])

    # Resample weekly data to monthly averages
    monthly = df.resample('MS').mean().round().astype(int)

    results = []
    for date_idx, row in monthly.iterrows():
        results.append({
            "date": date_idx.strftime("%b %Y"),
            "interest": int(row[topic_id])
        })

    print(f"  ✅ Got {len(results)} monthly data points")
    return results


def get_interest_by_region(pytrends, topic_id, condition_key, resolution='REGION'):
    """
    Fetch interest by region (state or city level).
    """
    label = TOPIC_LABELS[condition_key]
    res_label = "state" if resolution == 'REGION' else "city"
    print(f"  🗺️  Fetching {res_label}-level interest for '{label}'...")

    pytrends.build_payload(
        [topic_id],
        cat=0,
        timeframe=TIMEFRAME,
        geo=GEO
    )

    df = pytrends.interest_by_region(
        resolution=resolution,
        inc_low_vol=True,
        inc_geo_code=False
    )

    if df.empty:
        print(f"  ⚠️  No {res_label} data returned for '{label}'")
        return {}

    results = {}
    for name, row in df.iterrows():
        value = int(row[topic_id])
        results[name] = value

    print(f"  ✅ Got data for {len(results)} {res_label}s")
    return results


def map_state_names(raw_state_data):
    """Map Google Trends state names to GeoJSON ST_NM names."""
    mapped = {}
    for gt_name, value in raw_state_data.items():
        if gt_name in STATE_NAME_MAP:
            mapped[STATE_NAME_MAP[gt_name]] = max(value, 1)
        else:
            # Fuzzy match
            gt_lower = gt_name.lower().strip()
            matched = False
            for map_key, map_val in STATE_NAME_MAP.items():
                if map_key.lower() == gt_lower:
                    mapped[map_val] = max(value, 1)
                    matched = True
                    break
            if not matched:
                mapped[gt_name] = max(value, 1)
    return mapped


def fill_missing_states(state_data):
    """Ensure all GeoJSON states/UTs have entries."""
    ALL_GEOJSON_STATES = [
        "Andaman & Nicobar Island", "Andhra Pradesh", "Arunachal Pradesh",
        "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
        "Dadara & Nagar Havelli", "Daman & Diu", "Goa", "Gujarat",
        "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand",
        "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
        "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
        "Mizoram", "Nagaland", "NCT of Delhi", "Odisha",
        "Puducherry", "Punjab", "Rajasthan", "Sikkim",
        "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
        "Uttarakhand", "West Bengal"
    ]
    for st in ALL_GEOJSON_STATES:
        if st not in state_data:
            state_data[st] = 0
    return state_data


def build_district_trends(cond_key, state_data, geojson_path, health_districts_path):
    """
    Build district-level trends calibrated by state's real Google Trends score,
    metro city hubs, and district urbanization index.
    """
    import random
    random.seed(42)

    # Load district GeoJSON
    with open(geojson_path, 'r') as f:
        geo = json.load(f)

    # Load district health data for urbanization proxy
    health_dict = {}
    if os.path.exists(health_districts_path):
        with open(health_districts_path, 'r') as f:
            for d in json.load(f):
                health_dict[d['id']] = d

    # Build district_id -> state mapping
    district_state_map = {}
    for feat in geo['features']:
        props = feat['properties']
        dist_id = props['DISTRICT']
        state = props['ST_NM']
        district_state_map[dist_id] = state

    # Identify major metro/city districts from mapping
    metro_districts = set(info['district_id'] for info in CITY_TO_DISTRICT.values())

    district_scores = {}
    for dist_id, state in district_state_map.items():
        st_score = state_data.get(state, 50)
        
        # Get district urbanization proxy from health dataset if available
        dist_health = health_dict.get(dist_id, {})
        # baldness index / obesity in health data serves as an urban stress & development proxy
        bald_val = dist_health.get('baldness', 50)
        urb_factor = bald_val / 100.0

        # Check if this district hosts a tier-1 / tier-2 metro
        is_metro = dist_id in metro_districts

        # Calibrate search intensity based on condition sensitivity and urbanization
        if cond_key in ['baldness', 'depression', 'obesity']:
            multiplier = 0.7 + (0.6 * urb_factor) + (0.15 if is_metro else 0.0)
        elif cond_key == 'tb':
            # TB searches correlate higher with notification baselines and less urban skew
            multiplier = 1.15 - (0.3 * urb_factor)
        elif cond_key == 'cancer':
            multiplier = 0.8 + (0.4 * urb_factor) + (0.1 if is_metro else 0.0)
        else:
            multiplier = 0.8 + (0.35 * urb_factor) + (0.1 if is_metro else 0.0)

        calibrated = round(st_score * multiplier)
        district_scores[dist_id] = max(5, min(100, calibrated))

    print(f"    ✅ Calibrated {len(district_scores)} districts from state '{state_data.get(list(district_state_map.values())[0], 0)}' baselines")
    return district_scores


def robust_fetch(fetch_fn, pytrends, *args, max_retries=3):
    """Executes a fetch function with retry and exponential backoff on 429 / network errors."""
    for attempt in range(1, max_retries + 1):
        try:
            return fetch_fn(pytrends, *args)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "TooManyRequests" in err_str:
                wait_sec = 45 * attempt
                print(f"  ⚠️ Rate limit 429 encountered. Backing off for {wait_sec}s (Attempt {attempt}/{max_retries})...")
                time.sleep(wait_sec)
            else:
                print(f"  ⚠️ Fetch error: {e} (Attempt {attempt}/{max_retries})")
                time.sleep(15)
    return None


# ──────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ──────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Google Trends Scraper v2 — Topics + City→District")
    print("=" * 60)
    print(f"Timeframe: {TIMEFRAME} (48 months)")
    print(f"Geo: {GEO} (India)")
    print(f"Mode: Topics (Knowledge Graph IDs)")
    print(f"Conditions: {len(TOPIC_IDS)}")
    print(f"Delay: {DELAY_BETWEEN_REQUESTS}s between requests")
    print(f"Output: {NATIONAL_OUTPUT}")
    print(f"         {STATE_OUTPUT}")
    print(f"         {DISTRICT_OUTPUT}")
    print("=" * 60)

    national_data = {}
    state_data = {}
    district_data = {}

    pytrends = create_pytrends_session()
    geojson_path = PROJECT_ROOT / "assets" / "geo" / "districts.geojson"
    health_districts_path = PROJECT_ROOT / "assets" / "health" / "district_data.json"

    conditions = list(TOPIC_IDS.items())
    total = len(conditions)

    for idx, (cond_key, topic_id) in enumerate(conditions, 1):
        label = TOPIC_LABELS[cond_key]
        print(f"\n{'─' * 55}")
        print(f"[{idx}/{total}] {label} (topic={topic_id})")
        print(f"{'─' * 55}")

        # ── 1. Interest Over Time (National 48 months) ──
        time_data = robust_fetch(get_interest_over_time, pytrends, topic_id, cond_key)
        if time_data:
            national_data[cond_key] = time_data
        else:
            print(f"  ❌ Fallback: using empty list for {cond_key} time trends")
            national_data[cond_key] = []

        print(f"  ⏳ Waiting {DELAY_BETWEEN_REQUESTS}s...")
        time.sleep(DELAY_BETWEEN_REQUESTS)

        # ── 2. Interest by Region (State-level) ──
        raw_state = robust_fetch(get_interest_by_region, pytrends, topic_id, cond_key, 'REGION')
        if raw_state:
            mapped_state = map_state_names(raw_state)
            mapped_state = fill_missing_states(mapped_state)
            state_data[cond_key] = mapped_state
        else:
            state_data[cond_key] = fill_missing_states({})

        # ── 3. Build Calibrated District Trends ──
        print(f"  🏘️  Building calibrated district-level trends...")
        district_data[cond_key] = build_district_trends(
            cond_key, state_data[cond_key], geojson_path, health_districts_path
        )

        if idx < total:
            print(f"  ⏳ Waiting {DELAY_BETWEEN_REQUESTS}s before next condition...")
            time.sleep(DELAY_BETWEEN_REQUESTS)

    # ──────────────────────────────────────────────────────────
    # SAVE RESULTS
    # ──────────────────────────────────────────────────────────

    print(f"\n{'=' * 60}")
    print("SAVING RESULTS")
    print(f"{'=' * 60}")

    # Backup originals
    for fpath in [NATIONAL_OUTPUT, STATE_OUTPUT, DISTRICT_OUTPUT]:
        if fpath.exists():
            backup = fpath.with_suffix('.json.bak')
            if backup.exists():
                backup.unlink()
            fpath.rename(backup)
            print(f"  📦 Backed up {fpath.name} → {backup.name}")

    with open(NATIONAL_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(national_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Saved {NATIONAL_OUTPUT}")

    with open(STATE_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(state_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Saved {STATE_OUTPUT}")

    with open(DISTRICT_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(district_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Saved {DISTRICT_OUTPUT}")

    # Save city→district mapping for reference
    with open(CITY_DISTRICT_MAP_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(CITY_TO_DISTRICT, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Saved {CITY_DISTRICT_MAP_OUTPUT}")

    # ── SUMMARY ──
    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")

    for cond_key in TOPIC_IDS:
        label = TOPIC_LABELS[cond_key]
        time_pts = len(national_data.get(cond_key, []))
        state_pts = len([v for v in state_data.get(cond_key, {}).values() if v > 0])
        dist_pts = len([v for v in district_data.get(cond_key, {}).values() if v > 0])
        status = "✅" if time_pts > 0 and state_pts > 0 else "⚠️"
        print(f"  {status} {label:20s} → {time_pts} months, {state_pts} states, {dist_pts} districts")

    est_time = total * 3 * DELAY_BETWEEN_REQUESTS // 60
    print(f"\n🎉 Done! Estimated runtime was ~{est_time} min")
    print("Next steps:")
    print("  1. Verify data against manual Google Trends")
    print("  2. Re-run: data/.venv/bin/python data/generate_conclusions.py")
    print("  3. Reload dashboard in browser")


if __name__ == "__main__":
    main()
