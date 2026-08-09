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

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

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


def is_already_public(ticker):
    """Best-effort secondary confirmation: query Yahoo Finance's chart API
    for a live quote under this exact ticker. trade.xyz's own docs are
    sometimes stale - a company can IPO without its IPOP entry ever getting
    a "Converted on" marker (observed for SPCX/SpaceX). This only works when
    the dex's synthetic ticker happens to match the real listed ticker (true
    for US-listed names like SPCX, not for foreign A-share names). Returns
    False on any ambiguity so a missing/failed lookup never overrides the
    primary docs-based classification.
    """
    try:
        resp = requests.get(
            YAHOO_CHART_URL.format(symbol=ticker),
            params={"range": "1d", "interval": "1d"},
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return False

    results = ((data.get("chart") or {}).get("result")) or []
    if not results:
        return False
    meta = results[0].get("meta") or {}
    has_price = bool(meta.get("regularMarketPrice"))
    is_equity = meta.get("instrumentType") == "EQUITY"
    has_exchange = bool(meta.get("fullExchangeName") or meta.get("exchangeName"))
    return has_price and is_equity and has_exchange


def fetch_ipop_tickers(known_symbols):
    """Best-effort scrape of trade.xyz's own IPOP docs to find which of our
    known dex symbols are pre-IPO perpetuals. Returns None on failure so the
    caller can fall back to the last-known set instead of wiping it out.
    """
    # Hyperliquid dex symbol names are namespaced (e.g. "xyz:UNITREE"), but
    # trade.xyz's docs just say "UNITREE" - match on the bare ticker.
    base_to_full = {sym.split(":", 1)[-1]: sym for sym in known_symbols}

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
        text = resp.text
        # Each IPOP has its own section with boilerplate phrasing, e.g.
        # "UNITREE is a pre-IPO market reflecting the market-implied
        # expected price...". Anchor on that phrase rather than a bare
        # ticker match - a bare-word search over the whole spec index
        # false-positives on tickers whose name coincidentally appears in
        # another company's description (e.g. "DRAM" inside CXMT's blurb).
        for base in base_to_full:
            m = re.search(
                r"(?<![A-Za-z0-9])" + re.escape(base) + r"\s+is\s+a\s+pre-IPO\s+market",
                text,
                re.IGNORECASE,
            )
            if not m:
                continue
            # Once a company actually IPOs, trade.xyz keeps the descriptive
            # text but appends a "Converted on <date>" marker instead of
            # removing the entry - e.g. CBRS/Cerebras and SPCX/SpaceX both
            # say "... Converted on <date>. See ..." while still-private
            # names like UNITREE only describe a future conversion event.
            window = text[m.end():m.end() + 800]
            if re.search(r"Converted\s+on\b", window, re.IGNORECASE):
                continue
            # Secondary confirmation for docs entries that never got a
            # "Converted on" marker even though the company already IPO'd
            # (e.g. SPCX/SpaceX) - only fires when the dex ticker matches a
            # real, actively-traded listing on Yahoo Finance.
            if is_already_public(base):
                print(
                    f"INFO: {base} matched pre-IPO docs but Yahoo Finance shows it's already "
                    "publicly traded, excluding.",
                    file=sys.stderr,
                )
                continue
            matched.add(base_to_full[base])

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
