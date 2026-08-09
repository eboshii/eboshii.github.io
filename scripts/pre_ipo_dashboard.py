#!/usr/bin/env python3
"""Fetches live listings from trade.xyz's HIP-3 dex on Hyperliquid (pre-IPO
perpetuals such as Unitree, plus other equity perps) and writes them to
_data/pre_ipo.json so the Jekyll site can render the dashboard page.

Tracks first-seen timestamps in data/pre_ipo_state.json across runs so
genuinely new listings can be flagged in the UI.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
DEX = "xyz"

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
    return {"known": {}}


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

    markets = []
    for entry, ctx in zip(universe, asset_ctxs):
        sym = entry["name"]
        if sym not in known:
            known[sym] = {"first_seen": now_iso}
        markets.append(
            {
                "symbol": sym,
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

    state["last_run"] = now_iso
    save_state(state)

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(
            {
                "last_run": now_iso,
                "new_symbols": sorted(new_symbols) if not first_run else [],
                "market_count": len(markets),
                "markets": markets,
            },
            indent=2,
        )
        + "\n"
    )

    if first_run:
        print(f"First run: seeded state with {len(markets)} known markets.")
    elif new_symbols:
        print(f"NEW LISTING DETECTED: {', '.join(sorted(new_symbols))}")
    else:
        print("No new listings.")


if __name__ == "__main__":
    main()
