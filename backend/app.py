# app.py
from flask import Flask, jsonify, request
import sqlite3
import threading
import time
import schedule
import feedparser
from datetime import datetime
from .models import init_db, DB_FILE 

DB = DB_FILE
app = Flask(__name__)

# ------------------ FEEDS ------------------
FEEDS = {
    "http://feeds.bbci.co.uk/news/world/rss.xml": "Conflict",
    "https://feeds.reuters.com/reuters/worldNews": "Conflict",
    "http://rss.cnn.com/rss/edition_world.rss": "Conflict",
    "https://www.aljazeera.com/xml/rss/all.xml": "Conflict",
    "http://feeds.bbci.co.uk/news/business/rss.xml": "Economy",
    "https://feeds.reuters.com/reuters/businessNews": "Economy",
    "http://feeds.bbci.co.uk/news/technology/rss.xml": "Technology",
    "https://feeds.arstechnica.com/arstechnica/index/": "Technology",
    "https://www.theguardian.com/environment/rss": "Environment",
    "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml": "Environment"
}

# ------------------ COLLECTOR ------------------
def fetch_and_store():
    print("🚀 Fetching at", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    try:
        conn = sqlite3.connect(DB, timeout=10, check_same_thread=False)
        c = conn.cursor()

        for url, default_category in FEEDS.items():
            feed = feedparser.parse(url)
            for entry in feed.entries[:10]:
                link = getattr(entry, "link", None)
                title = getattr(entry, "title", "")

                if not link:
                    continue

                c.execute("SELECT 1 FROM news WHERE source=?", (link,))
                if not c.fetchone():
                    c.execute(
                        "INSERT INTO news (headline, source, timestamp, category, bias) VALUES (?, ?, ?, ?, ?)",
                        (title, link, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), default_category, None)
                    )
                    print(f"✅ Saved: {title}")

        conn.commit()
        conn.close()
    except Exception as e:
        print("❌ Error:", e)

def run_scheduler():
    schedule.every(10).minutes.do(fetch_and_store)
    while True:
        schedule.run_pending()
        time.sleep(5)

# ------------------ DB HELPER ------------------
def query_db(query, args=(), one=False):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(query, args)
    rows = cur.fetchall()
    conn.close()
    return (rows[0] if rows else None) if one else rows

# ------------------ ROUTES ------------------
@app.route("/api/news")
def api_news():
    date_filter = request.args.get("date")
    limit = int(request.args.get("limit", 10))
    offset = int(request.args.get("offset", 0))

    if date_filter:
        rows = query_db(
            "SELECT id, headline, source, timestamp, category, bias FROM news WHERE date(timestamp)=? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (date_filter, limit, offset)
        )
    else:
        rows = query_db(
            "SELECT id, headline, source, timestamp, category, bias FROM news ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )
    return jsonify([dict(r) for r in rows]), 200

@app.route("/api/dates")
def api_dates():
    rows = query_db("SELECT DISTINCT date(timestamp) as d FROM news ORDER BY d DESC")
    return jsonify([r["d"] for r in rows]), 200

@app.route("/api/classify/<int:news_id>", methods=["POST"])
def api_classify(news_id):
    data = request.json or {}
    category = data.get("category")
    bias = data.get("bias")
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE news SET category=?, bias=? WHERE id=?", (category, bias, news_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 200

# ------------------ NEW: /api/stats ------------------
@app.route("/api/stats")
def api_stats():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Categories
    c.execute("SELECT category, COUNT(*) as count FROM news GROUP BY category")
    categories = {}
    for row in c.fetchall():
        key = row["category"] if row["category"] is not None else "Unclassified"
        categories[key] = row["count"]

    # Bias = treating as "severity" for now
    c.execute("SELECT bias, COUNT(*) as count FROM news GROUP BY bias")
    # coerce NULL/None bias values to a stable string so jsonify won't fail when sorting keys
    severity = {}
    for row in c.fetchall():
        key = row["bias"] if row["bias"] is not None else "Unclassified"
        severity[key] = row["count"]

    # Total
    c.execute("SELECT COUNT(*) as total FROM news")
    total = c.fetchone()["total"]

    conn.close()
    return jsonify({
        "categories": categories,
        "severity": severity,
        "total": total
    }), 200

# ------------------ NEW: /api/insights ------------------
@app.route("/api/insights")
def api_insights():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT category, COUNT(*) as count FROM news GROUP BY category")
    cats = {}
    for row in c.fetchall():
        key = row["category"] if row["category"] is not None else "Unclassified"
        cats[key] = row["count"]

    c.execute("SELECT bias, COUNT(*) as count FROM news GROUP BY bias")
    bias = {}
    for row in c.fetchall():
        key = row["bias"] if row["bias"] is not None else "Unclassified"
        bias[key] = row["count"]

    conn.close()

    summary = []
    if cats.get("Conflict", 0) > 5:
        summary.append("⚠️ Rising number of conflict-related news.")
    if cats.get("Economy", 0) > 5:
        summary.append("📉 Economic risks are increasing.")
    if bias.get("Potential Bias", 0) > 0:
        summary.append("🔍 Some articles flagged as biased.")

    if not summary:
        summary.append("✅ Situation stable. No critical alerts today.")

    return jsonify({"insights": " ".join(summary)}), 200


# ------------------ NEW: /api/threats (derived items + server-side filters)
@app.route("/api/threats")
def api_threats():
    """Return derived threat items computed from news rows.

    Query params supported (all optional):
      threatType, locationScope, locationName, emergency, maturity, limit, offset
    """
    # simple helpers
    def map_category(cat):
        if not cat:
            return "Unknown"
        m = {
            "Conflict": "Armed Conflict",
            "Economy": "Economic Collapse",
            "Environment": "Climate Change",
            "Technology": "Technology",
            "Health": "Pandemic & Health",
            "Climate": "Climate Change",
        }
        return m.get(cat, cat)

    def detect_location(headline, source):
        # naive country/region detection from headline keywords or hostname
        regions = {
            "UK": ["UK", "Britain", "Britain's", "British", "England"],
            "China": ["China", "Chinese", "Taiwan"],
            "Middle East": ["Gaza", "Israel", "Palestine", "Syria", "Iraq"],
            "Ukraine": ["Ukraine", "Kiev", "Kyiv"],
            "US": ["US", "United States", "America", "Washington"],
            "India": ["India", "Indian"],
        }
        for name, kws in regions.items():
            for kw in kws:
                if kw.lower() in (headline or "").lower():
                    return ("Country", name)

        # fallback by hostname
        try:
            host = source and source.split("//")[-1].split("/")[0]
            if host and ("bbc" in host or host.endswith('.co.uk')):
                return ("Region", "UK")
            if host and "aljazeera" in host:
                return ("Region", "Middle East")
            if host and "nytimes" in host:
                return ("Country", "US")
            if host and "reuters" in host:
                return ("Region", "Global")
        except Exception:
            pass
        return ("Global", "Global")

    def score_severity(headline, category, bias):
        # deterministic keyword scoring (0-100)
        text = (headline or "") + " " + (category or "") + " " + (bias or "")
        text = text.lower()
        score = 0
        keywords = {
            30: ["risk", "risk of", "threat"],
            40: ["flood", "storm", "typhoon", "hurricane", "drought", "climate"],
            50: ["disease", "outbreak", "pandemic", "virus", "infection"],
            60: ["protest", "unrest", "violence", "attack", "killed", "dead", "death"],
            80: ["war", "invasion", "massacre", "genocide", "collapse", "crisis"]
        }
        for pts, kws in keywords.items():
            for kw in kws:
                if kw in text:
                    score = max(score, pts)
        # bias increases severity slightly
        if bias and "potential" in bias.lower():
            score = min(100, score + 5)
        return score

    def maturity_from(severity, timestamp_str):
        try:
            t = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                t = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M")
            except Exception:
                return "Emerging"
        age_days = (datetime.now() - t).days
        if severity >= 80 or (age_days <= 1 and severity >= 60):
            return "Critical"
        if severity >= 55 or age_days <= 7:
            return "Escalating"
        return "Emerging"

    def emergency_from(severity):
        if severity >= 75:
            return "High"
        if severity >= 50:
            return "Medium"
        return "Low"

    # fetch rows
    rows = query_db("SELECT id, headline, source, timestamp, category, bias FROM news ORDER BY timestamp DESC")

    items = []
    for r in rows:
        headline = r["headline"]
        source = r["source"]
        category = r["category"]
        bias = r["bias"]
        threatType = map_category(category)
        locationScope, locationName = detect_location(headline, source)
        severity = score_severity(headline, category, bias)
        maturity = maturity_from(severity, r["timestamp"])
        emergency = emergency_from(severity)

        item = {
            "id": r["id"],
            "title": headline,
            "threatType": threatType,
            "locationScope": locationScope,
            "locationName": locationName,
            "emergency": emergency,
            "maturity": maturity,
            "severity": severity,
            "sources": [r["source"]],
            "time": r["timestamp"],
            # small deterministic trend sample
            "trend": [max(0, severity - 5), severity, min(100, severity + 3)],
        }
        items.append(item)

    # apply filters from query params
    q = request.args
    threatType_q = q.get("threatType")
    locationScope_q = q.get("locationScope")
    locationName_q = q.get("locationName")
    emergency_q = q.get("emergency")
    maturity_q = q.get("maturity")

    def passes(it):
        if threatType_q and it["threatType"] != threatType_q:
            return False
        if locationScope_q and it["locationScope"] != locationScope_q:
            return False
        if locationName_q and it["locationName"] != locationName_q:
            return False
        if emergency_q and it["emergency"] != emergency_q:
            return False
        if maturity_q and it["maturity"] != maturity_q:
            return False
        return True

    filtered = [it for it in items if passes(it)]

    # pagination
    try:
        limit = int(q.get("limit", 50))
    except Exception:
        limit = 50
    try:
        offset = int(q.get("offset", 0))
    except Exception:
        offset = 0

    paged = filtered[offset: offset + limit]
    return jsonify({"total": len(filtered), "items": paged}), 200


# ------------------ NEW: /api/analysis/<id> ------------------
@app.route("/api/analysis/<int:news_id>")
def api_analysis(news_id):
    """Return simple analysis for a given news row id.

    Response shape:
      {
         "id": <news_id>,
         "type": <mapped threat type>,
         "citizens_affected": <int>,
         "regions": ["Region A", ...],
         "political_capital_lost_pct": <float>
      }
    """
    row = query_db("SELECT id, headline, source, timestamp, category, bias FROM news WHERE id=?", (news_id,), one=True)
    if not row:
        return jsonify({"error": "not found"}), 404

    # reuse mapping helpers from above by inlining simplified logic
    def map_category(cat):
        if not cat:
            return "Unknown"
        m = {
            "Conflict": "Armed Conflict",
            "Economy": "Economic Collapse",
            "Environment": "Climate Change",
            "Technology": "Technology",
            "Health": "Pandemic & Health",
            "Climate": "Climate Change",
        }
        return m.get(cat, cat)

    def detect_regions(headline, source):
        regions = []
        # naive region detection
        kws_map = {
            'US': ['US', 'United States', 'America', 'Washington'],
            'UK': ['UK', 'Britain', 'British', 'England'],
            'China': ['China', 'Chinese', 'Beijing'],
            'India': ['India', 'Indian'],
            'Middle East': ['Gaza', 'Israel', 'Palestine', 'Syria', 'Iraq'],
            'Ukraine': ['Ukraine', 'Kyiv', 'Kiev'],
        }
        text = (headline or "") + ' ' + (source or '')
        t = text.lower()
        for region, kws in kws_map.items():
            for kw in kws:
                if kw.lower() in t:
                    regions.append(region)
                    break
        if not regions:
            # fallback to host-based rough region
            try:
                host = source and source.split('//')[-1].split('/')[0]
                if host:
                    if 'aljazeera' in host:
                        regions.append('Middle East')
                    elif 'bbc' in host or host.endswith('.co.uk'):
                        regions.append('UK')
                    elif 'nytimes' in host or 'cnn' in host:
                        regions.append('US')
            except Exception:
                pass
        if not regions:
            regions = ['Global']
        return regions

    def estimate_population_for_regions(regions):
        # simple lookups (orders of magnitude)
        pop_map = {
            'US': 330_000_000,
            'UK': 67_000_000,
            'China': 1_400_000_000,
            'India': 1_380_000_000,
            'Middle East': 300_000_000,
            'Ukraine': 44_000_000,
            'Global': 8_000_000_000,
        }
        # return sum of populations for matched regions
        s = 0
        for r in regions:
            s += pop_map.get(r, 10_000_000)
        return s

    def estimate_exposure(population, severity):
        # severity 0-100: assume linear percent exposed between 0.1% and 25%
        pct = 0.001 + (min(100, max(0, severity)) / 100.0) * 0.249
        return int(population * pct)

    def estimate_political_loss_pct(severity, category):
        # simple heuristic: severity-driven percent of a small national budget share
        base = 0.1  # baseline 0.1%
        severity_factor = severity / 100.0 * 5.0  # up to +5%
        category_factor = 0.0
        if 'Conflict' in category:
            category_factor = 1.0
        if 'Economic' in category:
            category_factor = 0.5
        return round(min(30.0, base + severity_factor + category_factor), 2)

    headline = row['headline']
    source = row['source']
    category = row['category'] or ''
    # derive severity similarly to threats endpoint
    def score_severity(headline, category, bias):
        text = (headline or '') + ' ' + (category or '') + ' ' + (bias or '')
        text = text.lower()
        score = 0
        keywords = {
            30: ['risk', 'risk of', 'threat'],
            40: ['flood', 'storm', 'typhoon', 'hurricane', 'drought', 'climate'],
            50: ['disease', 'outbreak', 'pandemic', 'virus', 'infection'],
            60: ['protest', 'unrest', 'violence', 'attack', 'killed', 'dead', 'death'],
            80: ['war', 'invasion', 'massacre', 'genocide', 'collapse', 'crisis']
        }
        for pts, kws in keywords.items():
            for kw in kws:
                if kw in text:
                    score = max(score, pts)
        return score

    # sqlite3.Row supports mapping access but not .get
    bias_val = None
    try:
        bias_val = row['bias']
    except Exception:
        bias_val = None
    severity = score_severity(headline, category, bias_val)
    threat_type = map_category(category)
    regions = detect_regions(headline, source)
    population = estimate_population_for_regions(regions)
    citizens_affected = estimate_exposure(population, severity)
    political_loss_pct = estimate_political_loss_pct(severity, threat_type)

    return jsonify({
        'id': news_id,
        'type': threat_type,
        'citizens_affected': citizens_affected,
        'regions': regions,
        'political_capital_lost_pct': political_loss_pct
    }), 
from flask import Flask, send_from_directory
import os

app = Flask(
    __name__,
    static_folder="../frontend/build/static",   # points to the actual static files
    template_folder="../frontend/build"        # points to index.html
)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # Serve static files if they exist
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # Otherwise serve React's index.html
    else:
        return send_from_directory(app.template_folder, "index.html")


# ------------------ MAIN ------------------
if __name__ == "__main__":
    init_db()
    fetch_and_store()  # initial run
    t = threading.Thread(target=run_scheduler, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5000, debug=False)
