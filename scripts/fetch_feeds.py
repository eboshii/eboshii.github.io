#!/usr/bin/env python3
"""
News Feed Aggregator for Jekyll / GitHub Pages.
Fetches high-quality RSS/Atom feeds, normalizes headlines and timestamps,
and writes the structured data to `_data/news.json`.
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
# Configuration: Categories & RSS Feeds
# ---------------------------------------------------------------------------
FEEDS_CONFIG = [
    {
        "category_id": "world",
        "category_title": "World & Wire",
        "feeds": [
            {"name": "BBC News", "short": "BBC", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "limit": 15},
            {"name": "The Guardian", "short": "Guardian", "url": "https://www.theguardian.com/world/rss", "limit": 15},
            {"name": "NPR News", "short": "NPR", "url": "https://feeds.npr.org/1001/rss.xml", "limit": 12},
            {"name": "Deutsche Welle", "short": "DW", "url": "https://rss.dw.com/rdf/rss-en-all", "limit": 12},
            {"name": "Al Jazeera", "short": "AlJazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml", "limit": 12},
        ]
    },
    {
        "category_id": "tech",
        "category_title": "Tech & Computing",
        "feeds": [
            {"name": "Hacker News", "short": "HN", "url": "https://news.ycombinator.com/rss", "limit": 20},
            {"name": "Ars Technica", "short": "Ars", "url": "https://feeds.arstechnica.com/arstechnica/index", "limit": 15},
            {"name": "The Verge", "short": "Verge", "url": "https://www.theverge.com/rss/index.xml", "limit": 15},
            {"name": "Lobsters", "short": "Lobsters", "url": "https://lobste.rs/rss", "limit": 12},
            {"name": "MIT Tech Review", "short": "MIT", "url": "https://www.technologyreview.com/feed/", "limit": 10},
        ]
    },
    {
        "category_id": "markets",
        "category_title": "Markets & Finance",
        "feeds": [
            {"name": "MarketWatch", "short": "MW", "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories", "limit": 15},
            {"name": "Yahoo Finance", "short": "YahooFin", "url": "https://finance.yahoo.com/news/rssindex", "limit": 15},
            {"name": "Financial Times", "short": "FT", "url": "https://www.ft.com/news-feed?format=rss", "limit": 12},
            {"name": "Calculated Risk", "short": "CalcRisk", "url": "https://calculatedrisk.substack.com/feed", "limit": 10},
        ]
    },
    {
        "category_id": "science",
        "category_title": "Science & Research",
        "feeds": [
            {"name": "Nature", "short": "Nature", "url": "https://www.nature.com/nature.rss", "limit": 15},
            {"name": "Phys.org", "short": "Phys.org", "url": "https://phys.org/rss-feed/", "limit": 15},
            {"name": "Quanta Magazine", "short": "Quanta", "url": "https://api.quantamagazine.org/feed/", "limit": 10},
            {"name": "ScienceDaily", "short": "SciDaily", "url": "https://www.sciencedaily.com/rss/all.xml", "limit": 12},
            {"name": "Yale E360", "short": "YaleE360", "url": "https://e360.yale.edu/feed.xml", "limit": 10},
        ]
    },
    {
        "category_id": "culture",
        "category_title": "Culture & Ideas",
        "feeds": [
            {"name": "Aeon", "short": "Aeon", "url": "https://aeon.co/feed.rss", "limit": 10},
            {"name": "Nautilus", "short": "Nautilus", "url": "https://nautil.us/feed", "limit": 10},
            {"name": "Noema", "short": "Noema", "url": "https://www.noemamag.com/feed/", "limit": 10},
            {"name": "3 Quarks Daily", "short": "3QD", "url": "https://3quarksdaily.com/feed", "limit": 10},
            {"name": "BBC Culture", "short": "BBCCult", "url": "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "limit": 10},
        ]
    }
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/rdf+xml, application/atom+xml, application/xml, text/xml, */*"
}

def clean_text(text: str) -> str:
    """Removes HTML tags, decodes entities, and cleans whitespace."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def parse_time_relative(pub_time_struct) -> str:
    """Formats time into short human-readable string (e.g. 15m, 2h, 1d)."""
    if not pub_time_struct:
        return ""
    try:
        dt = datetime.datetime(*pub_time_struct[:6], tzinfo=datetime.timezone.utc)
        now = datetime.datetime.now(datetime.timezone.utc)
        diff = now - dt
        seconds = int(diff.total_seconds())

        if seconds < 0:
            return "just now"
        if seconds < 60:
            return f"{seconds}s"
        minutes = seconds // 60
        if minutes < 60:
            return f"{minutes}m"
        hours = minutes // 60
        if hours < 24:
            return f"{hours}h"
        days = hours // 24
        if days < 7:
            return f"{days}d"
        return dt.strftime("%b %d")
    except Exception:
        return ""

def fetch_feed(feed_meta: dict):
    """Fetches a single feed and returns normalized items."""
    url = feed_meta["url"]
    source_name = feed_meta["name"]
    source_short = feed_meta.get("short", source_name)
    limit = feed_meta.get("limit", 10)
    items = []

    try:
        # Use requests with timeout and proper User-Agent
        if requests:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                print(f"[WARN] Failed to fetch {url}: HTTP {resp.status_code}")
                return items
            feed = feedparser.parse(resp.content) if feedparser else None
        else:
            feed = feedparser.parse(url) if feedparser else None

        if not feed or not feed.entries:
            print(f"[WARN] No entries found for {source_name} ({url})")
            return items

        for entry in feed.entries[:limit]:
            title = clean_text(getattr(entry, "title", ""))
            link = getattr(entry, "link", "")
            if not title or not link:
                continue

            # Parse time
            pub_struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
            iso_time = ""
            time_relative = ""
            if pub_struct:
                try:
                    dt = datetime.datetime(*pub_struct[:6], tzinfo=datetime.timezone.utc)
                    iso_time = dt.isoformat()
                    time_relative = parse_time_relative(pub_struct)
                except Exception:
                    pass

            domain = urlparse(link).netloc.replace("www.", "")

            items.append({
                "title": title,
                "url": link,
                "source": source_name,
                "source_short": source_short,
                "domain": domain,
                "published_iso": iso_time,
                "time_ago": time_relative
            })

    except Exception as e:
        print(f"[ERROR] Error processing {source_name} ({url}): {e}")

    return items

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

        # Fetch feeds concurrently
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_feed = {executor.submit(fetch_feed, f): f for f in cat["feeds"]}
            for future in as_completed(future_to_feed):
                feed_items = future.result()
                cat_items.extend(feed_items)

        # Sort items: latest items first if published_iso exists
        cat_items.sort(key=lambda x: x.get("published_iso") or "", reverse=True)

        # Deduplicate titles within category
        seen_titles = set()
        unique_items = []
        for item in cat_items:
            norm_title = re.sub(r"[^a-zA-Z0-9]", "", item["title"].lower())
            if norm_title and norm_title not in seen_titles:
                seen_titles.add(norm_title)
                unique_items.append(item)

        print(f"  -> Collected {len(unique_items)} unique headlines")
        total_headlines += len(unique_items)

        output_data["categories"].append({
            "id": cat_id,
            "title": cat_title,
            "count": len(unique_items),
            "items": unique_items
        })

    output_data["total_count"] = total_headlines

    # Determine output path relative to repo root
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(repo_root, "_data")
    os.makedirs(data_dir, exist_ok=True)
    out_file = os.path.join(data_dir, "news.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n[SUCCESS] Wrote {total_headlines} headlines to {out_file}")

if __name__ == "__main__":
    main()
