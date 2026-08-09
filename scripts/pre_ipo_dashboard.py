#!/usr/bin/env python3
"""Fetches live listings from trade.xyz's HIP-3 dex on Hyperliquid and writes
them to _data/pre_ipo.json so the Jekyll site can render the dashboard page.

The "xyz" dex bundles pre-IPO perpetuals (IPOPs) together with public
equities, commodities, FX, and indices under one namespace, and the
Hyperliquid API exposes no field distinguishing them. To classify each
symbol we cross-reference trade.xyz's own IPOP specification index, which
is the platform's source of truth for which tickers are pre-IPO.

Tracks first-seen timestamps and the last-known IPOP ticker set in
data/pre_ipo_state.json across runs, so genuinely new listings can be
flagged even if a given run's classification fetch fails.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
DEX = "xyz"

IPOP_SPEC_URLS = [
    "https://docs.trade.xyz/consolidated-resources/specification-index-ipops",
    "https://docs.trade.xyz/asset-directory/pre-ipo-perpetuals-ipops",
]

ROOT = Path(__file__).resolve().parent.parent
STATE_PATH = ROOT / "data" / "pre_ipo_state.json"
DATA_PATH = ROOT / "_data" / "pre_ipo.json"


def fetch_markets():
    resp = requests.post(
        HYPERLIQUID_INFO_URL,
        json={"type": "metaAndAssetCtxs", "dex": DEX},
        timeout=20,
    )
    resp.raise_for_status()
    meta, asset_ctxs = resp.json()
    return meta["universe"], asset_ctxs


def fetch_ipop_tickers(known_symbols):
    """Best-effort scrape of trade.xyz's own IPOP docs to find which of our
    known dex symbols are pre-IPO perpetuals. Returns None on failure so the
    caller can fall back to the last-known set instead of wiping it out.
    """
    matched = set()
    fetched_any = False
    for url in IPOP_SPEC_URLS:
        try:
            resp = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        except Exception as exc:
            print(f"WARNING: could not fetch {url}: {exc}", file=sys.stderr)
            continue
        fetched_any = True
        # Tickers in these docs render inside table cells / code spans as
        # bare uppercase tokens (e.g. ">UNITREE<"). Match against known dex
        # symbols rather than trying to parse exact table structure, so
        # markup changes on trade.xyz's side don't silently break this.
        tokens = set(re.findall(r">([A-Z][A-Z0-9]{2,14})<", resp.text))
        found = known_symbols & tokens
        matched |= found
        print(
            f"DEBUG {url}: status={resp.status_code} bytes={len(resp.text)} "
            f"has_UNITREE_text={'UNITREE' in resp.text.upper()} "
            f"regex_tokens={len(tokens)} matched_here={sorted(found)}",
            file=sys.stderr,
        )

    return matched if fetched_any else None


def pct_change(mark, prev):
    try:
        mark_f, prev_f = float(mark), float(prev)
        if prev_f == 0:
            return None
        return (mark_f - prev_f) / prev_f * 100
    except (TypeError, ValueError):
        return None


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"known": {}, "known_ipop_tickers": []}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def main():
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        universe, asset_ctxs = fetch_markets()
    except Exception as exc:
        print(f"ERROR fetching markets: {exc}", file=sys.stderr)
        sys.exit(1)

    state = load_state()
    known = state.setdefault("known", {})
    first_run = len(known) == 0

    current_symbols = {entry["name"] for entry in universe}
    new_symbols = current_symbols - set(known.keys())

    ipop_tickers = fetch_ipop_tickers(current_symbols)
    if ipop_tickers is None:
        ipop_tickers = set(state.get("known_ipop_tickers", []))
        print("WARNING: IPOP classification fetch failed, using last-known ticker set.", file=sys.stderr)
    else:
        state["known_ipop_tickers"] = sorted(ipop_tickers)

    markets = []
    for entry, ctx in zip(universe, asset_ctxs):
        sym = entry["name"]
        if sym not in known:
            known[sym] = {"first_seen": now_iso}
        markets.append(
            {
                "symbol": sym,
                "is_pre_ipo": sym in ipop_tickers,
                "max_leverage": entry.get("maxLeverage"),
                "mark_px": ctx.get("markPx"),
                "prev_day_px": ctx.get("prevDayPx"),
                "pct_change": pct_change(ctx.get("markPx"), ctx.get("prevDayPx")),
                "open_interest": ctx.get("openInterest"),
                "day_volume": ctx.get("dayNtlVlm"),
                "funding": ctx.get("funding"),
                "first_seen": known[sym]["first_seen"],
                "is_new": sym in new_symbols and not first_run,
            }
        )
    markets.sort(key=lambda m: m["symbol"])

    # The IPOP docs are trade.xyz's own reference material, not a live feed -
    # they may lag behind a market actually going live on the dex. Flag any
    # brand-new symbol we can't yet match to the docs too, so a real pre-IPO
    # listing is never missed just because trade.xyz hasn't updated their
    # page yet. This trades a few false positives (a new commodity/FX pair)
    # for never missing the early signal that matters.
    new_pre_ipo_symbols = new_symbols & ipop_tickers
    new_unclassified_symbols = new_symbols - ipop_tickers

    state["last_run"] = now_iso
    save_state(state)

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(
            {
                "last_run": now_iso,
                "new_pre_ipo_symbols": sorted(new_pre_ipo_symbols) if not first_run else [],
                "new_unclassified_symbols": sorted(new_unclassified_symbols) if not first_run else [],
                "market_count": len(markets),
                "pre_ipo_count": len(ipop_tickers),
                "markets": markets,
            },
            indent=2,
        )
        + "\n"
    )

    if first_run:
        print(f"First run: seeded state with {len(markets)} known markets ({len(ipop_tickers)} pre-IPO).")
    else:
        if new_pre_ipo_symbols:
            print(f"NEW LISTING DETECTED: {', '.join(sorted(new_pre_ipo_symbols))}")
        if new_unclassified_symbols:
            print(
                "NEW UNCLASSIFIED SYMBOL: "
                f"{', '.join(sorted(new_unclassified_symbols))} "
                "(not yet matched to trade.xyz's IPOP docs - verify manually)"
            )
        if not new_pre_ipo_symbols and not new_unclassified_symbols:
            print("No new listings.")


if __name__ == "__main__":
    main()
