#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch 500.com WC group matches and generate map_500_match_id UPDATE SQL for t_match."""

import json
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_FILE = BASE / "db-wc-matches-stauiums-2026.json"
CACHE_FILE = BASE / "500-wc-19476-matches.json"
OUT_FILE = BASE.parent / "dbs" / "update_t_match_map_500_2026.sql"

SEASON_ID = 19476
PAGE_URL = f"https://liansai.500.com/zuqiu-{SEASON_ID}/"
API_URL = "https://liansai.500.com/index.php?c=match&a=getmatch"
GROUPS = list("ABCDEFGHIJKL")

ALIASES = {
    "佛得角共和国": "佛得角",
    "刚果民主共和国": "民主刚果",
    "波黑": "波斯尼亚和黑塞哥维那",
}


def norm(name: str) -> str:
    s = (name or "").strip().replace("奧", "奥")
    return ALIASES.get(s, s)


def w500_url(fid: int) -> str:
    return f"https://odds.500.com/fenxi/shuju-{fid}.shtml"


def sql_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "''")


def fetch_group_matches(use_cache: bool = True) -> list[dict]:
    if use_cache and CACHE_FILE.exists():
        cached = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        matches = cached.get("matches", [])
        if len(matches) >= 72:
            print(f"Using cache ({len(matches)} matches)")
            return matches

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": PAGE_URL,
    }
    all_matches: list[dict] = []
    for group in GROUPS:
        url = f"{API_URL}?sid={SEASON_ID}&round={group}"
        last_err = None
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    rows = json.loads(resp.read().decode("utf-8"))
                break
            except Exception as e:
                last_err = e
                time.sleep(1 + attempt)
        else:
            raise RuntimeError(f"Failed to fetch group {group}: {last_err}") from last_err
        for row in rows:
            row["group"] = group
        all_matches.extend(rows)
        time.sleep(0.3)
    return all_matches


def save_cache(matches: list[dict]) -> None:
    payload = {
        "source": "500.com",
        "sourceUrl": PAGE_URL,
        "seasonId": SEASON_ID,
        "groupCount": len(GROUPS),
        "matchCount": len(matches),
        "matches": matches,
    }
    CACHE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    print(f"Fetching group matches from {PAGE_URL} ...")
    w500_matches = fetch_group_matches()
    save_cache(w500_matches)
    print(f"Cached {len(w500_matches)} matches -> {CACHE_FILE}")

    with open(DB_FILE, encoding="utf-8") as f:
        db_rows = json.load(f)["rows"]

    exact_idx = {}
    for m in w500_matches:
        key = (m["stime"], norm(m["hsxname"]), norm(m["gsxname"]))
        exact_idx[key] = m

    teams_idx: dict[tuple[str, str], list] = defaultdict(list)
    for m in w500_matches:
        teams_idx[(norm(m["hsxname"]), norm(m["gsxname"]))].append(m)

    matched: dict[str, tuple] = {}
    unmatched_db = []
    skipped_existing = []

    for r in db_rows:
        key = (r["kickoff_time"], norm(r["home_name"]), norm(r["away_name"]))
        if r.get("map_500_match_id"):
            wm = exact_idx.get(key)
            if wm:
                skipped_existing.append((r, wm))
            continue

        wm = exact_idx.get(key)
        method = "exact"
        if not wm:
            cands = teams_idx.get((norm(r["home_name"]), norm(r["away_name"])), [])
            if len(cands) == 1:
                wm, method = cands[0], "teams"
            elif len(cands) > 1:
                c2 = [c for c in cands if c["stime"] == r["kickoff_time"]]
                if len(c2) == 1:
                    wm, method = c2[0], "teams+kickoff"

        if wm:
            matched[r["match_id"]] = (r, wm, method)
        else:
            unmatched_db.append(r)

    lines = [
        "-- t_match map_500_match_id 映射 (500彩票网 -> 2026世界杯小组赛)",
        "-- 生成时间: 2026-06-06",
        f"-- 数据源: {PAGE_URL} (API getmatch sid={SEASON_ID}) + {DB_FILE.name}",
        f"-- 待更新: {len(matched)} 场, 已有映射跳过: {len(skipped_existing)} 场, 无法匹配: {len(unmatched_db)} 场",
        "",
        "START TRANSACTION;",
        "",
    ]

    if skipped_existing:
        lines.append("-- ========== 已有映射(跳过) ==========")
        for r, wm in skipped_existing:
            lines.append(
                f"-- match_id={r['match_id']} already -> 500 fid {wm['fid']} "
                f"({r['kickoff_time']} {r['home_name']} vs {r['away_name']})"
            )
        lines.append("")

    for match_id in sorted(matched.keys(), key=lambda x: matched[x][0]["kickoff_time"]):
        r, wm, method = matched[match_id]
        url = w500_url(wm["fid"])
        lines.append(
            f"-- {r['kickoff_time']} {r['home_name']} vs {r['away_name']} "
            f"(500 fid {wm['fid']}, group {wm['group']}, {method})"
        )
        lines.append(
            f"UPDATE t_match SET map_500_match_id = '{sql_escape(url)}', "
            f"updated_time = NOW() WHERE match_id = '{sql_escape(match_id)}';"
        )
        lines.append("")

    lines.append("COMMIT;")

    if unmatched_db:
        lines.append("")
        lines.append("-- ========== 未匹配 db 比赛 ==========")
        for r in unmatched_db:
            lines.append(
                f"-- match_id={r['match_id']} | {r['kickoff_time']} | "
                f"{r['home_name']} vs {r['away_name']} | R{r['round_number']} {r['round_group']}"
            )

    OUT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(
        f"matched={len(matched)} skipped={len(skipped_existing)} "
        f"unmatched={len(unmatched_db)}"
    )
    print(f"written: {OUT_FILE}")


if __name__ == "__main__":
    main()
