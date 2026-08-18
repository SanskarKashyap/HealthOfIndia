#!/usr/bin/env python3
"""
Generate Precomputed Conclusions JSON for Health of India Dashboard.

Systematically analyzes:
  - state_data.json (NFHS-5 clinical metrics)
  - state_trends.json (Google Trends search interest)
  - national_time_trends.json (24-month national search trends)

Produces: assets/conclusions.json
  Structured per-condition with step-wise narrative conclusions.
  Every conclusion is strictly derived from numeric data.
"""

import json
import os
import statistics

# Paths
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_HEALTH = os.path.join(BASE, "assets", "health", "state_data.json")
STATE_TRENDS = os.path.join(BASE, "assets", "trends", "state_trends.json")
NATIONAL_TRENDS = os.path.join(BASE, "assets", "trends", "national_time_trends.json")
OUTPUT = os.path.join(BASE, "assets", "conclusions.json")

# Condition metadata
CONDITION_META = {
    "cancer": {
        "title": "Cancer",
        "healthLabel": "Cancer Screening Rate (%)",
        "healthUnit": "%",
        "healthInterpretation": "higher screening = better awareness"
    },
    "heart": {
        "title": "Heart Disease",
        "healthLabel": "Elevated BP Rate (%)",
        "healthUnit": "%",
        "healthInterpretation": "higher = worse burden"
    },
    "diabetes": {
        "title": "Diabetes",
        "healthLabel": "High Blood Sugar (%)",
        "healthUnit": "%",
        "healthInterpretation": "higher = worse burden"
    },
    "obesity": {
        "title": "Obesity",
        "healthLabel": "Overweight/Obese Women (%)",
        "healthUnit": "%",
        "healthInterpretation": "higher = worse burden"
    },
    "depression": {
        "title": "Depression",
        "healthLabel": "Mental Distress Index",
        "healthUnit": "score",
        "healthInterpretation": "higher = worse distress"
    },
    "tb": {
        "title": "Tuberculosis",
        "healthLabel": "TB Notification Proxy (per 100k)",
        "healthUnit": "per 100k",
        "healthInterpretation": "higher = worse burden"
    },
    "baldness": {
        "title": "Baldness / Hair Loss",
        "healthLabel": "Baldness Risk Index",
        "healthUnit": "score",
        "healthInterpretation": "higher = higher risk"
    },
    "dengue": {
        "title": "Dengue",
        "healthLabel": "Dengue Vulnerability Index",
        "healthUnit": "score",
        "healthInterpretation": "higher = higher vulnerability"
    }
}


def load_data():
    with open(STATE_HEALTH) as f:
        state_health = json.load(f)
    with open(STATE_TRENDS) as f:
        state_trends = json.load(f)
    with open(NATIONAL_TRENDS) as f:
        national_trends = json.load(f)
    return state_health, state_trends, national_trends


def fmt(val, unit):
    if unit == "%":
        return f"{val:.1f}%"
    elif unit == "per 100k":
        return f"{val:.0f} per 100k"
    elif unit == "score":
        return f"{val:.1f}"
    return f"{val:.1f}"


def analyze_time_trends(trend_data, cond, meta):
    """Step 1: Analyze national time-series search interest."""
    points = trend_data[cond]
    interests = [p["interest"] for p in points]
    dates = [p["date"] for p in points]

    avg_interest = statistics.mean(interests)
    max_interest = max(interests)
    min_interest = min(interests)
    max_date = dates[interests.index(max_interest)]
    min_date = dates[interests.index(min_interest)]

    # First half vs second half trend
    half = len(interests) // 2
    first_half_avg = statistics.mean(interests[:half])
    second_half_avg = statistics.mean(interests[half:])
    trend_direction = "upward" if second_half_avg > first_half_avg + 2 else ("downward" if second_half_avg < first_half_avg - 2 else "stable")
    trend_pct = abs(second_half_avg - first_half_avg) / first_half_avg * 100

    # Volatility
    stdev = statistics.stdev(interests)
    volatility = "high" if stdev > 15 else ("moderate" if stdev > 8 else "low")

    # Seasonality check: look for repeated patterns
    seasonal_note = ""
    if cond == "dengue":
        monsoon_months = [i for i, d in enumerate(dates) if any(m in d for m in ["Jul", "Aug", "Sep", "Oct"])]
        monsoon_avg = statistics.mean([interests[i] for i in monsoon_months]) if monsoon_months else 0
        non_monsoon = [interests[i] for i in range(len(interests)) if i not in monsoon_months]
        non_monsoon_avg = statistics.mean(non_monsoon) if non_monsoon else 0
        if monsoon_avg > non_monsoon_avg * 2:
            seasonal_note = f"Strong monsoon seasonality detected: monsoon months average {monsoon_avg:.0f} vs. non-monsoon {non_monsoon_avg:.0f} — a {monsoon_avg/non_monsoon_avg:.1f}x spike."
    elif cond == "baldness":
        summer = [i for i, d in enumerate(dates) if any(m in d for m in ["Jul", "Aug", "Sep"])]
        if summer:
            summer_avg = statistics.mean([interests[i] for i in summer])
            rest_avg = statistics.mean([interests[i] for i in range(len(interests)) if i not in summer])
            if summer_avg > rest_avg * 1.15:
                seasonal_note = f"Summer spike pattern: Jul–Sep average ({summer_avg:.0f}) is {((summer_avg/rest_avg)-1)*100:.0f}% higher than other months ({rest_avg:.0f})."

    conclusion = (
        f"Over the 24-month period (Jan 2024–Dec 2025), national search interest for \"{meta['title']}\" "
        f"averaged {avg_interest:.0f}/100. "
        f"Peak interest hit {max_interest} in {max_date}, while the lowest was {min_interest} in {min_date}. "
        f"The overall trend is {trend_direction} "
        f"(H1 avg: {first_half_avg:.0f}, H2 avg: {second_half_avg:.0f}, {trend_pct:.1f}% change). "
        f"Search volatility is {volatility} (σ = {stdev:.1f})."
    )
    if seasonal_note:
        conclusion += f" {seasonal_note}"

    return {
        "summary": conclusion,
        "metrics": {
            "average": round(avg_interest, 1),
            "peak": {"value": max_interest, "date": max_date},
            "trough": {"value": min_interest, "date": min_date},
            "trend": trend_direction,
            "h1_avg": round(first_half_avg, 1),
            "h2_avg": round(second_half_avg, 1),
            "volatility": volatility,
            "stdev": round(stdev, 1)
        }
    }


def analyze_search_map(trends_data, cond, meta):
    """Step 2: Analyze state-level search intensity geography."""
    cond_trends = trends_data[cond]
    sorted_states = sorted(cond_trends.items(), key=lambda x: x[1], reverse=True)

    top5 = sorted_states[:5]
    bottom5 = sorted_states[-5:]
    values = list(cond_trends.values())
    avg_search = statistics.mean(values)
    median_search = statistics.median(values)

    # Concentration: how many states are above avg
    above_avg = [s for s, v in cond_trends.items() if v > avg_search]
    below_avg = [s for s, v in cond_trends.items() if v <= avg_search]

    top_str = ", ".join([f"{s} ({v})" for s, v in top5])
    bottom_str = ", ".join([f"{s} ({v})" for s, v in bottom5])

    conclusion = (
        f"Search interest for \"{meta['title']}\" varies dramatically across states. "
        f"National average: {avg_search:.0f}, median: {median_search:.0f}. "
        f"Top 5 searchers: {top_str}. "
        f"Bottom 5: {bottom_str}. "
        f"{len(above_avg)} of {len(cond_trends)} states are above average, "
        f"indicating {'concentrated' if len(above_avg) < len(cond_trends) * 0.35 else 'distributed'} search interest."
    )

    state_insights = []
    for s, v in sorted_states:
        tier = "very high" if v >= 80 else ("high" if v >= 60 else ("moderate" if v >= 40 else "low"))
        state_insights.append({
            "state": s,
            "searchInterest": v,
            "tier": tier
        })

    return {
        "summary": conclusion,
        "metrics": {
            "nationalAverage": round(avg_search, 1),
            "median": round(median_search, 1),
            "top5": [{"state": s, "value": v} for s, v in top5],
            "bottom5": [{"state": s, "value": v} for s, v in bottom5],
            "statesAboveAvg": len(above_avg),
            "totalStates": len(cond_trends)
        },
        "stateInsights": state_insights
    }


def analyze_health_map(health_data, cond, meta):
    """Step 3: Analyze clinical outcomes across states."""
    values_by_state = {d["state"]: d[cond] for d in health_data}
    sorted_states = sorted(values_by_state.items(), key=lambda x: x[1], reverse=True)

    values = list(values_by_state.values())
    avg_health = statistics.mean(values)
    median_health = statistics.median(values)
    stdev_health = statistics.stdev(values)

    top5 = sorted_states[:5]
    bottom5 = sorted_states[-5:]

    unit = meta["healthUnit"]
    top_str = ", ".join([f"{s} ({fmt(v, unit)})" for s, v in top5])
    bottom_str = ", ".join([f"{s} ({fmt(v, unit)})" for s, v in bottom5])

    spread = sorted_states[0][1] - sorted_states[-1][1]

    conclusion = (
        f"Clinical data ({meta['healthLabel']}) shows national average of {fmt(avg_health, unit)} "
        f"(median: {fmt(median_health, unit)}, σ: {fmt(stdev_health, unit)}). "
        f"Highest: {top_str}. "
        f"Lowest: {bottom_str}. "
        f"The spread between highest and lowest is {fmt(spread, unit)}, "
        f"revealing {'extreme' if spread > avg_health else 'significant'} regional disparity. "
        f"Interpretation: {meta['healthInterpretation']}."
    )

    state_insights = []
    for s, v in sorted_states:
        state_insights.append({
            "state": s,
            "healthValue": round(v, 2),
            "formattedValue": fmt(v, unit)
        })

    return {
        "summary": conclusion,
        "metrics": {
            "nationalAverage": round(avg_health, 2),
            "median": round(median_health, 2),
            "stdev": round(stdev_health, 2),
            "highest": {"state": sorted_states[0][0], "value": round(sorted_states[0][1], 2)},
            "lowest": {"state": sorted_states[-1][0], "value": round(sorted_states[-1][1], 2)},
            "spread": round(spread, 2)
        },
        "stateInsights": state_insights
    }


def analyze_correlation(health_data, trends_data, cond, meta):
    """Step 4: Analyze search vs. clinical correlation per state."""
    cond_trends = trends_data[cond]
    health_by_state = {d["state"]: d[cond] for d in health_data}

    # Build paired data
    paired = []
    for state in health_by_state:
        if state in cond_trends:
            paired.append({
                "state": state,
                "search": cond_trends[state],
                "health": health_by_state[state]
            })

    # Calculate Pearson-like correlation manually
    searches = [p["search"] for p in paired]
    healths = [p["health"] for p in paired]
    n = len(paired)

    mean_s = statistics.mean(searches)
    mean_h = statistics.mean(healths)
    cov = sum((s - mean_s) * (h - mean_h) for s, h in zip(searches, healths)) / n
    std_s = statistics.stdev(searches)
    std_h = statistics.stdev(healths)
    correlation = cov / (std_s * std_h) if std_s > 0 and std_h > 0 else 0

    corr_label = (
        "strong positive" if correlation > 0.6 else
        "moderate positive" if correlation > 0.3 else
        "weak positive" if correlation > 0.1 else
        "negligible" if correlation > -0.1 else
        "weak negative" if correlation > -0.3 else
        "moderate negative" if correlation > -0.6 else
        "strong negative"
    )

    # Identify mismatches (high search but low health, or vice versa)
    unit = meta["healthUnit"]
    # Normalize both to 0-1 scale for comparison
    s_min, s_max = min(searches), max(searches)
    h_min, h_max = min(healths), max(healths)
    s_range = s_max - s_min if s_max > s_min else 1
    h_range = h_max - h_min if h_max > h_min else 1

    mismatches = []
    alignments = []
    for p in paired:
        s_norm = (p["search"] - s_min) / s_range
        h_norm = (p["health"] - h_min) / h_range
        gap = s_norm - h_norm  # positive = over-searching, negative = under-searching

        entry = {
            "state": p["state"],
            "search": p["search"],
            "health": round(p["health"], 2),
            "healthFormatted": fmt(p["health"], unit),
            "gap": round(gap, 3),
            "gapType": "over-searching" if gap > 0.3 else ("under-searching" if gap < -0.3 else "aligned")
        }

        if abs(gap) > 0.3:
            mismatches.append(entry)
        elif abs(gap) < 0.15:
            alignments.append(entry)

    mismatches.sort(key=lambda x: abs(x["gap"]), reverse=True)
    alignments.sort(key=lambda x: abs(x["gap"]))

    mismatch_text = ""
    if mismatches:
        top_mismatches = mismatches[:5]
        descs = []
        for m in top_mismatches:
            if m["gapType"] == "over-searching":
                descs.append(f"{m['state']} (search: {m['search']}, health: {m['healthFormatted']} — high search, relatively low clinical burden)")
            else:
                descs.append(f"{m['state']} (search: {m['search']}, health: {m['healthFormatted']} — low search despite high clinical burden)")
        mismatch_text = f" Key mismatches: {'; '.join(descs)}."

    alignment_text = ""
    if alignments:
        top_alignments = alignments[:3]
        alignment_text = f" Well-aligned states: {', '.join([a['state'] for a in top_alignments])}."

    conclusion = (
        f"Correlation between search interest and clinical data for \"{meta['title']}\" is "
        f"{corr_label} (r = {correlation:.2f}). "
        f"Of {n} states analyzed, {len([m for m in mismatches if m['gapType'] == 'over-searching'])} show over-searching "
        f"(high digital anxiety, lower clinical burden) and "
        f"{len([m for m in mismatches if m['gapType'] == 'under-searching'])} show under-searching "
        f"(high clinical burden but low digital awareness)."
        f"{mismatch_text}{alignment_text}"
    )

    return {
        "summary": conclusion,
        "metrics": {
            "correlation": round(correlation, 3),
            "correlationLabel": corr_label,
            "totalStates": n,
            "overSearchingCount": len([m for m in mismatches if m["gapType"] == "over-searching"]),
            "underSearchingCount": len([m for m in mismatches if m["gapType"] == "under-searching"]),
            "alignedCount": len(alignments)
        },
        "mismatches": mismatches[:8],
        "alignments": alignments[:5]
    }


def analyze_outliers(health_data, trends_data, cond, meta):
    """Step 5: Identify and explain key outliers."""
    cond_trends = trends_data[cond]
    health_by_state = {d["state"]: d[cond] for d in health_data}
    unit = meta["healthUnit"]

    # Build combined ranking
    paired = []
    for state in health_by_state:
        if state in cond_trends:
            paired.append({
                "state": state,
                "search": cond_trends[state],
                "health": health_by_state[state]
            })

    searches = [p["search"] for p in paired]
    healths = [p["health"] for p in paired]
    s_min, s_max = min(searches), max(searches)
    h_min, h_max = min(healths), max(healths)
    s_range = s_max - s_min if s_max > s_min else 1
    h_range = h_max - h_min if h_max > h_min else 1

    for p in paired:
        p["s_norm"] = (p["search"] - s_min) / s_range
        p["h_norm"] = (p["health"] - h_min) / h_range
        p["gap"] = p["s_norm"] - p["h_norm"]

    # Top over-searchers (high anxiety, lower clinical burden)
    over_searchers = sorted([p for p in paired if p["gap"] > 0.2], key=lambda x: x["gap"], reverse=True)[:5]
    # Top under-searchers (silent burden — high clinical, low search)
    under_searchers = sorted([p for p in paired if p["gap"] < -0.2], key=lambda x: x["gap"])[:5]
    # Best aligned
    aligned = sorted(paired, key=lambda x: abs(x["gap"]))[:5]

    outlier_entries = []

    for p in over_searchers:
        outlier_entries.append({
            "state": p["state"],
            "search": p["search"],
            "health": round(p["health"], 2),
            "healthFormatted": fmt(p["health"], unit),
            "type": "over-searching",
            "insight": f"Search interest ({p['search']}) is disproportionately high relative to clinical metric ({fmt(p['health'], unit)}). This suggests high digital health anxiety or awareness that outpaces actual disease burden."
        })

    for p in under_searchers:
        outlier_entries.append({
            "state": p["state"],
            "search": p["search"],
            "health": round(p["health"], 2),
            "healthFormatted": fmt(p["health"], unit),
            "type": "under-searching",
            "insight": f"Clinical metric ({fmt(p['health'], unit)}) is high but search interest is only {p['search']}. This indicates a silent crisis — the population may lack internet access, awareness, or be searching in regional languages."
        })

    for p in aligned:
        outlier_entries.append({
            "state": p["state"],
            "search": p["search"],
            "health": round(p["health"], 2),
            "healthFormatted": fmt(p["health"], unit),
            "type": "aligned",
            "insight": f"Search interest ({p['search']}) and clinical data ({fmt(p['health'], unit)}) are well-aligned, suggesting proportional digital awareness relative to actual health burden."
        })

    over_text = ", ".join([f"{p['state']} (search: {p['search']}, {meta['healthLabel']}: {fmt(p['health'], unit)})" for p in over_searchers]) if over_searchers else "None identified"
    under_text = ", ".join([f"{p['state']} (search: {p['search']}, {meta['healthLabel']}: {fmt(p['health'], unit)})" for p in under_searchers]) if under_searchers else "None identified"

    conclusion = (
        f"Outlier analysis for \"{meta['title']}\": "
        f"Over-searchers (high digital anxiety, relatively lower burden): {over_text}. "
        f"Under-searchers (silent clinical burden, low digital tracking): {under_text}."
    )

    return {
        "summary": conclusion,
        "overSearchers": [e for e in outlier_entries if e["type"] == "over-searching"],
        "underSearchers": [e for e in outlier_entries if e["type"] == "under-searching"],
        "aligned": [e for e in outlier_entries if e["type"] == "aligned"]
    }


def analyze_national_matrix(health_data, trends_data, cond, meta):
    """Step 6: Overall condition summary for grid view."""
    cond_trends = trends_data[cond]
    health_by_state = {d["state"]: d[cond] for d in health_data}
    unit = meta["healthUnit"]

    search_values = list(cond_trends.values())
    health_values = list(health_by_state.values())

    avg_search = statistics.mean(search_values)
    avg_health = statistics.mean(health_values)
    max_search_state = max(cond_trends, key=cond_trends.get)
    min_search_state = min(cond_trends, key=cond_trends.get)
    max_health_state = max(health_by_state, key=health_by_state.get)
    min_health_state = min(health_by_state, key=health_by_state.get)

    conclusion = (
        f"National matrix for \"{meta['title']}\": "
        f"Average search interest: {avg_search:.0f}/100. Average clinical metric: {fmt(avg_health, unit)}. "
        f"Highest search: {max_search_state} ({cond_trends[max_search_state]}). "
        f"Lowest search: {min_search_state} ({cond_trends[min_search_state]}). "
        f"Highest clinical: {max_health_state} ({fmt(health_by_state[max_health_state], unit)}). "
        f"Lowest clinical: {min_health_state} ({fmt(health_by_state[min_health_state], unit)}). "
        f"This view shows the full landscape — comparing all states simultaneously on search vs. reality for {meta['title'].lower()}."
    )

    # Per-state combined summary
    state_matrix = []
    for state in health_by_state:
        if state in cond_trends:
            state_matrix.append({
                "state": state,
                "search": cond_trends[state],
                "health": round(health_by_state[state], 2),
                "healthFormatted": fmt(health_by_state[state], unit)
            })
    state_matrix.sort(key=lambda x: x["health"], reverse=True)

    return {
        "summary": conclusion,
        "metrics": {
            "avgSearch": round(avg_search, 1),
            "avgHealth": round(avg_health, 2),
            "highestSearch": {"state": max_search_state, "value": cond_trends[max_search_state]},
            "lowestSearch": {"state": min_search_state, "value": cond_trends[min_search_state]},
            "highestHealth": {"state": max_health_state, "value": round(health_by_state[max_health_state], 2)},
            "lowestHealth": {"state": min_health_state, "value": round(health_by_state[min_health_state], 2)}
        },
        "stateMatrix": state_matrix
    }


def main():
    state_health, state_trends, national_trends = load_data()

    conclusions = {}

    for cond, meta in CONDITION_META.items():
        print(f"Analyzing: {meta['title']}...")

        conclusions[cond] = {
            "title": meta["title"],
            "healthLabel": meta["healthLabel"],
            "healthUnit": meta["healthUnit"],
            "healthInterpretation": meta["healthInterpretation"],
            "steps": {
                "1_timeTrends": analyze_time_trends(national_trends, cond, meta),
                "2_searchMap": analyze_search_map(state_trends, cond, meta),
                "3_healthMap": analyze_health_map(state_health, cond, meta),
                "4_correlation": analyze_correlation(state_health, state_trends, cond, meta),
                "5_outliers": analyze_outliers(state_health, state_trends, cond, meta),
                "6_nationalMatrix": analyze_national_matrix(state_health, state_trends, cond, meta)
            }
        }

    with open(OUTPUT, "w") as f:
        json.dump(conclusions, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Conclusions written to: {OUTPUT}")
    print(f"   Total conditions: {len(conclusions)}")
    print(f"   Steps per condition: 6")


if __name__ == "__main__":
    main()
