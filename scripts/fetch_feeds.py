#!/usr/bin/env python3
"""
News Feed Aggregator for Jekyll / GitHub Pages.
Fetches high-quality RSS/Atom feeds, applies noise filtering,
multi-source story clustering, and significance ranking,
and outputs a concise, high-signal feed in `_data/news.json`.
"""

import os
import json
import re
import html
import datetime
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    import requests
except ImportError:
    requests = None

# ---------------------------------------------------------------------------
# Configuration: Categories & RSS Feeds (1-Word Titles)
# ---------------------------------------------------------------------------
FEEDS_CONFIG = [
    # --- Top 10 Core Broad-Appeal Categories (Default Active) ---
    {
        "category_id": "world",
        "category_title": "World",
        "feeds": [
            {"name": "BBC News", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "limit": 20},
            {"name": "The Guardian", "short": "GDN", "url": "https://www.theguardian.com/world/rss", "limit": 20},
            {"name": "NPR News", "short": "NPR", "url": "https://feeds.npr.org/1001/rss.xml", "limit": 15},
            {"name": "Deutsche Welle", "short": "DW", "url": "https://rss.dw.com/rdf/rss-en-all", "limit": 15},
            {"name": "Al Jazeera", "short": "AJ", "url": "https://www.aljazeera.com/xml/rss/all.xml", "limit": 15},
            {"name": "France 24", "short": "F24", "url": "https://www.france24.com/en/rss", "limit": 15},
        ]
    },
    {
        "category_id": "politics",
        "category_title": "Politics",
        "feeds": [
            {"name": "Politico", "short": "POL", "url": "https://rss.politico.com/politics-news.xml", "limit": 18},
            {"name": "The Hill", "short": "HIL", "url": "https://thehill.com/feed/", "limit": 18},
            {"name": "BBC Politics", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/politics/rss.xml", "limit": 15},
            {"name": "Guardian Politics", "short": "GDN", "url": "https://www.theguardian.com/politics/rss", "limit": 15},
        ]
    },
    {
        "category_id": "science",
        "category_title": "Science",
        "feeds": [
            {"name": "Nature", "short": "NAT", "url": "https://www.nature.com/nature.rss", "limit": 15},
            {"name": "Phys.org", "short": "PHY", "url": "https://phys.org/rss-feed/", "limit": 15},
            {"name": "Quanta Magazine", "short": "QNT", "url": "https://api.quantamagazine.org/feed/", "limit": 12},
            {"name": "ScienceDaily", "short": "SCI", "url": "https://www.sciencedaily.com/rss/all.xml", "limit": 12},
            {"name": "Space.com", "short": "SPC", "url": "https://www.space.com/feeds/all", "limit": 15},
            {"name": "Yale E360", "short": "YAL", "url": "https://e360.yale.edu/feed.xml", "limit": 10},
        ]
    },
    {
        "category_id": "tech",
        "category_title": "Tech",
        "feeds": [
            {"name": "Hacker News", "short": "HN", "url": "https://news.ycombinator.com/rss", "limit": 25},
            {"name": "Ars Technica", "short": "ARS", "url": "https://feeds.arstechnica.com/arstechnica/index", "limit": 20},
            {"name": "The Verge", "short": "VRG", "url": "https://www.theverge.com/rss/index.xml", "limit": 20},
            {"name": "Lobsters", "short": "LOB", "url": "https://lobste.rs/rss", "limit": 15},
            {"name": "MIT Tech Review", "short": "MIT", "url": "https://www.technologyreview.com/feed/", "limit": 12},
            {"name": "Techmeme", "short": "TM", "url": "https://www.techmeme.com/feed.xml", "limit": 20},
            {"name": "Phoronix", "short": "PHX", "url": "https://www.phoronix.com/phoronix-rss.php", "limit": 15},
        ]
    },
    {
        "category_id": "markets",
        "category_title": "Markets",
        "feeds": [
            {"name": "MarketWatch", "short": "MW", "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories", "limit": 20},
            {"name": "Yahoo Finance", "short": "YF", "url": "https://finance.yahoo.com/news/rssindex", "limit": 20},
            {"name": "Financial Times", "short": "FT", "url": "https://www.ft.com/news-feed?format=rss", "limit": 15},
            {"name": "Calculated Risk", "short": "CR", "url": "https://calculatedrisk.substack.com/feed", "limit": 12},
            {"name": "Seeking Alpha", "short": "SA", "url": "https://seekingalpha.com/market_currents.xml", "limit": 15},
        ]
    },
    {
        "category_id": "ai",
        "category_title": "AI",
        "feeds": [
            {"name": "LessWrong", "short": "LW", "url": "https://www.lesswrong.com/feed.xml?view=curated-rss", "limit": 15},
            {"name": "arXiv cs.AI", "short": "ARX", "url": "https://rss.arxiv.org/rss/cs.AI", "limit": 20},
            {"name": "Hugging Face", "short": "HF", "url": "https://huggingface.co/blog/feed.xml", "limit": 12},
            {"name": "MIT AI", "short": "MIT", "url": "https://news.mit.edu/rss/topic/artificial-intelligence2", "limit": 12},
            {"name": "The Gradient", "short": "GRD", "url": "https://thegradient.pub/rss/", "limit": 10},
            {"name": "VentureBeat AI", "short": "VBA", "url": "https://venturebeat.com/category/ai/feed/", "limit": 15},
        ]
    },
    {
        "category_id": "culture",
        "category_title": "Culture",
        "feeds": [
            {"name": "Arts & Letters", "short": "ALD", "url": "https://aldaily.com/feed/", "limit": 15},
            {"name": "3 Quarks Daily", "short": "3QD", "url": "https://www.3quarksdaily.com/feed", "limit": 15},
            {"name": "The Marginalian", "short": "MRG", "url": "https://www.themarginalian.org/feed/", "limit": 10},
            {"name": "Aeon", "short": "AEO", "url": "https://aeon.co/feed.rss", "limit": 12},
            {"name": "Nautilus", "short": "NTL", "url": "https://nautil.us/feed", "limit": 12},
            {"name": "Noema", "short": "NMA", "url": "https://www.noemamag.com/feed/", "limit": 10},
            {"name": "Literary Hub", "short": "LIT", "url": "https://lithub.com/feed/", "limit": 12},
        ]
    },
    {
        "category_id": "movies",
        "category_title": "Movies",
        "feeds": [
            {"name": "Variety", "short": "VAR", "url": "https://variety.com/feed/", "limit": 18},
            {"name": "Deadline", "short": "DDL", "url": "https://deadline.com/feed/", "limit": 18},
            {"name": "IndieWire", "short": "IND", "url": "https://www.indiewire.com/feed/", "limit": 15},
            {"name": "Hollywood Rep", "short": "THR", "url": "https://www.hollywoodreporter.com/feed/", "limit": 15},
            {"name": "Roger Ebert", "short": "EBT", "url": "https://www.rogerebert.com/feed", "limit": 12},
        ]
    },
    {
        "category_id": "music",
        "category_title": "Music",
        "feeds": [
            {"name": "Pitchfork", "short": "P4K", "url": "https://pitchfork.com/rss/news/", "limit": 18},
            {"name": "Stereogum", "short": "SGM", "url": "https://www.stereogum.com/feed/", "limit": 18},
            {"name": "NME", "short": "NME", "url": "https://www.nme.com/feed", "limit": 15},
            {"name": "Consequence", "short": "CSQ", "url": "https://consequence.net/feed/", "limit": 15},
            {"name": "Bandcamp Daily", "short": "BCD", "url": "https://daily.bandcamp.com/feed", "limit": 12},
        ]
    },
    {
        "category_id": "gaming",
        "category_title": "Gaming",
        "feeds": [
            {"name": "Rock Paper Shotgun", "short": "RPS", "url": "https://www.rockpapershotgun.com/feed", "limit": 15},
            {"name": "Eurogamer", "short": "EUR", "url": "https://www.eurogamer.net/feed", "limit": 15},
            {"name": "Polygon", "short": "PLY", "url": "https://www.polygon.com/rss/index.xml", "limit": 15},
            {"name": "PC Gamer", "short": "PCG", "url": "https://www.pcgamer.com/rss/", "limit": 15},
            {"name": "Game Developer", "short": "GMD", "url": "https://www.gamedeveloper.com/rss.xml", "limit": 12},
        ]
    },

    # --- Specialized & Regional Categories (Available in Settings) ---
    {
        "category_id": "environment",
        "category_title": "Environment",
        "feeds": [
            {"name": "Inside Climate", "short": "ICN", "url": "https://insideclimatenews.org/feed/", "limit": 18},
            {"name": "Carbon Brief", "short": "CRB", "url": "https://www.carbonbrief.org/feed/", "limit": 15},
            {"name": "Guardian Envr", "short": "GDN", "url": "https://www.theguardian.com/environment/rss", "limit": 18},
            {"name": "Canary Media", "short": "CNR", "url": "https://www.canarymedia.com/rss", "limit": 15},
            {"name": "CleanTechnica", "short": "CLN", "url": "https://cleantechnica.com/feed/", "limit": 15},
            {"name": "Yale E360", "short": "YAL", "url": "https://e360.yale.edu/feed.xml", "limit": 12},
        ]
    },
    {
        "category_id": "geopolitics",
        "category_title": "Geopolitics",
        "feeds": [
            {"name": "The Diplomat", "short": "DIP", "url": "https://thediplomat.com/feed/", "limit": 15},
            {"name": "Foreign Policy", "short": "FP", "url": "https://foreignpolicy.com/feed/", "limit": 15},
            {"name": "War on the Rocks", "short": "WTR", "url": "https://warontherocks.com/feed/", "limit": 15},
            {"name": "Defense One", "short": "DEF", "url": "https://www.defenseone.com/rss/all/", "limit": 15},
            {"name": "FP Blogs", "short": "FPB", "url": "https://foreignpolicyblogs.com/feed/", "limit": 12},
        ]
    },
    {
        "category_id": "europe",
        "category_title": "Europe",
        "feeds": [
            {"name": "Euronews", "short": "ENW", "url": "https://www.euronews.com/rss?format=mrss&level=theme&name=news", "limit": 15},
            {"name": "Politico Europe", "short": "PLE", "url": "https://www.politico.eu/feed/", "limit": 15},
            {"name": "DW Europe", "short": "DW", "url": "https://rss.dw.com/rdf/rss-en-eu", "limit": 15},
            {"name": "BBC Europe", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/world/europe/rss.xml", "limit": 15},
        ]
    },
    {
        "category_id": "asia",
        "category_title": "Asia",
        "feeds": [
            {"name": "South China MP", "short": "SCM", "url": "https://www.scmp.com/rss/91/feed", "limit": 15},
            {"name": "Mainichi News", "short": "MAI", "url": "https://mainichi.jp/english/rss/etc/mainichi.rss", "limit": 15},
            {"name": "BBC Asia", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "limit": 15},
            {"name": "CNA", "short": "CNA", "url": "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "limit": 15},
        ]
    },
    {
        "category_id": "africa",
        "category_title": "Africa",
        "feeds": [
            {"name": "BBC Africa", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/world/africa/rss.xml", "limit": 18},
            {"name": "Guardian Africa", "short": "GDN", "url": "https://www.theguardian.com/world/africa/rss", "limit": 15},
            {"name": "Africa Report", "short": "TAR", "url": "https://www.theafricareport.com/feed/", "limit": 12},
        ]
    },
    {
        "category_id": "startups",
        "category_title": "Startups",
        "feeds": [
            {"name": "TechCrunch", "short": "TC", "url": "https://techcrunch.com/category/startups/feed/", "limit": 18},
            {"name": "Crunchbase", "short": "CRN", "url": "https://news.crunchbase.com/feed/", "limit": 15},
            {"name": "StrictlyVC", "short": "SVC", "url": "https://strictlyvc.com/feed/", "limit": 12},
            {"name": "Sifted", "short": "SFT", "url": "https://sifted.eu/feed", "limit": 12},
        ]
    },
    {
        "category_id": "cybersec",
        "category_title": "Cybersecurity",
        "feeds": [
            {"name": "The Hacker News", "short": "THN", "url": "https://feeds.feedburner.com/TheHackersNews", "limit": 15},
            {"name": "Bleeping Computer", "short": "BLP", "url": "https://www.bleepingcomputer.com/feed/", "limit": 15},
            {"name": "Krebs on Security", "short": "KRB", "url": "https://krebsonsecurity.com/feed/", "limit": 10},
            {"name": "Dark Reading", "short": "DKR", "url": "https://www.darkreading.com/rss.xml", "limit": 15},
            {"name": "SecurityWeek", "short": "SWK", "url": "https://www.securityweek.com/feed/", "limit": 15},
        ]
    },
    {
        "category_id": "crypto",
        "category_title": "Crypto",
        "feeds": [
            {"name": "CoinDesk", "short": "CDK", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "limit": 18},
            {"name": "Cointelegraph", "short": "CT", "url": "https://cointelegraph.com/rss", "limit": 18},
            {"name": "Decrypt", "short": "DEC", "url": "https://decrypt.co/feed", "limit": 15},
            {"name": "The Block", "short": "TBK", "url": "https://www.theblock.co/rss.xml", "limit": 15},
            {"name": "Blockworks", "short": "BWK", "url": "https://blockworks.co/feed", "limit": 15},
        ]
    }
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/rdf+xml, application/atom+xml, application/xml, text/xml, */*"
}

try:
    from dateutil import parser as date_parser
except ImportError:
    date_parser = None

MAX_AGE_SECONDS = 24 * 60 * 60  # Strict 24-hour cutoff
MAX_HEADLINES_PER_SECTION = 20   # Curated concise limit for high-signal columns

NOISE_PATTERNS = [
    r"^(live updates|as it happened|watch live|live video|video:|podcast:|listen:|listen to:)",
    r"(deals? of the day|best deals?|coupon|sponsored|save \$\d+|buying guide)",
    r"^(what to watch|here's what you need to know|daily brief|morning brief)",
]

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "should", "could", "may", "might", "must", "can", "this", "that", "these", "those",
    "it", "its", "as", "if", "than", "so", "no", "not", "only", "own", "same", "such",
    "too", "very", "s", "t", "just", "don", "now", "says", "said", "new", "how", "why",
    "what", "who", "when", "where", "which"
}

def is_noise(title: str) -> bool:
    t = title.strip().lower()
    if len(t) < 16 or len(t.split()) < 3:
        return True
    for p in NOISE_PATTERNS:
        if re.search(p, t):
            return True
    return False

def clean_text(text: str) -> str:
    """Removes HTML tags, decodes entities, and cleans whitespace."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def parse_entry_datetime(entry) -> datetime.datetime:
    """Extracts and normalizes timezone-aware UTC datetime from an RSS entry."""
    pub_struct = (getattr(entry, "published_parsed", None)
                  or getattr(entry, "updated_parsed", None)
                  or getattr(entry, "created_parsed", None))
    if pub_struct:
        try:
            return datetime.datetime(*pub_struct[:6], tzinfo=datetime.timezone.utc)
        except Exception:
            pass

    for attr in ["published", "updated", "created", "pubDate", "dc:date"]:
        val = getattr(entry, attr, None) or entry.get(attr)
        if val and date_parser:
            try:
                dt = date_parser.parse(val)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                else:
                    dt = dt.astimezone(datetime.timezone.utc)
                return dt
            except Exception:
                pass
    return None

def format_time_relative(seconds: int, dt: datetime.datetime) -> str:
    """Formats time difference into short string (e.g. 15m, 2h, 23h)."""
    if seconds < 0:
        return "now"
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    return dt.strftime("%b %d")

def extract_keywords(title: str) -> set:
    """Extracts meaningful entity keywords from a title."""
    words = re.findall(r"[a-z0-9]+", title.lower())
    return {w for w in words if len(w) > 2 and w not in STOPWORDS}

def fetch_feed(feed_meta: dict):
    """Fetches a single feed and returns normalized items from the last 24 hours."""
    url = feed_meta["url"]
    source_name = feed_meta["name"]
    source_short = feed_meta.get("short", source_name)
    limit = feed_meta.get("limit", 20)
    items = []
    now = datetime.datetime.now(datetime.timezone.utc)

    try:
        if requests:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                print(f"[WARN] Failed to fetch {url}: HTTP {resp.status_code}")
                return items
            feed = feedparser.parse(resp.content) if feedparser else None
        else:
            feed = feedparser.parse(url) if feedparser else None

        if not feed or not feed.entries:
            return items

        for pos_idx, entry in enumerate(feed.entries):
            if len(items) >= limit:
                break

            title = clean_text(getattr(entry, "title", ""))
            link = getattr(entry, "link", "")
            if not title or not link or is_noise(title):
                continue

            dt = parse_entry_datetime(entry)
            iso_time = ""
            time_relative = ""
            age_seconds = 0

            if dt:
                age_seconds = int((now - dt).total_seconds())
                if age_seconds > MAX_AGE_SECONDS or age_seconds < -3600:
                    continue
                iso_time = dt.isoformat()
                time_relative = format_time_relative(age_seconds, dt)
            else:
                if len(items) >= 3:
                    continue

            domain = urlparse(link).netloc.replace("www.", "")

            items.append({
                "title": title,
                "url": link,
                "source": source_name,
                "source_short": source_short,
                "domain": domain,
                "published_iso": iso_time,
                "time_ago": time_relative,
                "age_seconds": age_seconds,
                "feed_pos": pos_idx
            })

    except Exception as e:
        print(f"[ERROR] Error processing {source_name} ({url}): {e}")

    return items

def score_and_curate_items(items: list, max_count: int = MAX_HEADLINES_PER_SECTION) -> list:
    """Ranks headlines by editorial lead position, cross-source clustering, and recency."""
    if not items:
        return []

    # Map keywords for cross-source cluster detection
    for item in items:
        pos = item.get("feed_pos", 0)
        pos_score = 1.0 / (1.0 + 0.15 * pos)
        age_hours = item.get("age_seconds", 0) / 3600.0
        recency_score = max(0.65, 1.20 - (age_hours / 30.0))

        # Detect cross-source coverage of the same event
        item_kw = extract_keywords(item["title"])
        corroborating_sources = set()

        for other in items:
            if other["source"] == item["source"]:
                continue
            other_kw = extract_keywords(other["title"])
            if len(item_kw.intersection(other_kw)) >= 2:
                corroborating_sources.add(other["source"])

        cluster_mult = 1.0 + (0.50 * len(corroborating_sources))

        # Source prestige / research weighting
        src_lower = item["source"].lower()
        src_boost = 1.12 if any(k in src_lower for k in ["nature", "science", "quanta", "hacker news", "lesswrong", "ft", "techmeme"]) else 1.0

        item["score"] = pos_score * cluster_mult * recency_score * src_boost

    # Sort by composite importance score descending
    items.sort(key=lambda x: (x.get("score", 0), x.get("published_iso", "")), reverse=True)

    # Return top curated items
    return items[:max_count]

def main():
    print(f"Starting news aggregation at {datetime.datetime.now(datetime.timezone.utc).isoformat()} UTC")

    output_data = {
        "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "categories": []
    }

    total_headlines = 0

    for cat in FEEDS_CONFIG:
        cat_id = cat["category_id"]
        cat_title = cat["category_title"]
        cat_items = []

        print(f"\nProcessing category: {cat_title} ({len(cat['feeds'])} feeds)")

        with ThreadPoolExecutor(max_workers=6) as executor:
            future_to_feed = {executor.submit(fetch_feed, f): f for f in cat["feeds"]}
            for future in as_completed(future_to_feed):
                feed_items = future.result()
                cat_items.extend(feed_items)

        # Deduplicate titles within category
        seen_titles = set()
        unique_items = []
        for item in cat_items:
            norm_title = re.sub(r"[^a-zA-Z0-9]", "", item["title"].lower())
            if norm_title and norm_title not in seen_titles:
                seen_titles.add(norm_title)
                unique_items.append(item)

        # Rank and curate to top high-signal headlines
        curated_items = score_and_curate_items(unique_items, MAX_HEADLINES_PER_SECTION)

        print(f"  -> Curated {len(curated_items)} high-significance headlines (from {len(unique_items)} candidates)")
        total_headlines += len(curated_items)

        output_data["categories"].append({
            "id": cat_id,
            "title": cat_title,
            "count": len(curated_items),
            "items": curated_items
        })

    output_data["total_count"] = total_headlines

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(repo_root, "_data")
    os.makedirs(data_dir, exist_ok=True)
    out_file = os.path.join(data_dir, "news.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n[SUCCESS] Wrote {total_headlines} curated headlines to {out_file}")

if __name__ == "__main__":
    main()
