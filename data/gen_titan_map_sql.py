#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Match titan007 cup matches to t_match rows and generate map_tian_match_id UPDATE SQL."""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent
TITAN_FILE = BASE / "titan-cupmatch-2026-s75.json"
DB_FILE = BASE / "db-wc-matches-stauiums-2026.json"
OUT_FILE = BASE.parent / "dbs" / "update_t_match_map_tian_2026.sql"

# db 队名 -> titan 队名
ALIASES = {
    "波黑": "波斯尼亚和黑塞哥维那",
    "刚果民主共和国": "民主刚果",
    "佛得角共和国": "佛得角",
}


def norm(name: str) -> str:
    s = (name or "").strip().replace("奧", "奥")
    return ALIASES.get(s, s)


def titan_url(match_id: int) -> str:
    return f"https://live.titan007.com/detail/{match_id}cn.htm?lineup=1"


def sql_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "''")


def main() -> None:
    with open(TITAN_FILE, encoding="utf-8") as f:
        titan = json.load(f)
    with open(DB_FILE, encoding="utf-8") as f:
        db = json.load(f)

    titan_matches = titan["allMatches"]
    db_rows = db["rows"]

    exact_idx = {}
    for m in titan_matches:
        key = (m["kickoff"], norm(m["home"]), norm(m["away"]))
        exact_idx[key] = m

    teams_idx: dict[tuple[str, str], list] = defaultdict(list)
    for m in titan_matches:
        teams_idx[(norm(m["home"]), norm(m["away"]))].append(m)

    matched: dict[str, tuple] = {}
    unmatched_db = []

    skipped_existing = []

    for r in db_rows:
        key = (r["kickoff_time"], norm(r["home_name"]), norm(r["away_name"]))
        if r.get("map_tian_match_id"):
            tm = exact_idx.get(key)
            if tm:
                skipped_existing.append((r, tm))
            continue
        tm = exact_idx.get(key)
        method = "exact"
        if not tm:
            cands = teams_idx.get((norm(r["home_name"]), norm(r["away_name"])), [])
            if len(cands) == 1:
                tm, method = cands[0], "teams"
            elif len(cands) > 1:
                c2 = [c for c in cands if c["kickoff"] == r["kickoff_time"]]
                if len(c2) == 1:
                    tm, method = c2[0], "teams+kickoff"

        if tm:
            matched[r["match_id"]] = (r, tm, method)
        else:
            unmatched_db.append(r)

    lines = [
        "-- t_match map_tian_match_id 映射 (titan007 -> 2026世界杯)",
        "-- 生成时间: 2026-06-06",
        f"-- 数据源: {TITAN_FILE.name} + {DB_FILE.name}",
        f"-- 待更新: {len(matched)} 场, 已有映射跳过: {len(skipped_existing)} 场, 无法匹配: {len(unmatched_db)} 场",
        "-- 说明: titan 数据仅含 A-H 组(48场小组赛), db 含 A-L 组(73场), I-L 组暂无 titan 对应",
        "",
        "START TRANSACTION;",
        "",
    ]

    if skipped_existing:
        lines.append("-- ========== 已有映射(跳过) ==========")
        for r, tm in skipped_existing:
            lines.append(
                f"-- match_id={r['match_id']} already -> titan {tm['matchId']} "
                f"({r['kickoff_time']} {r['home_name']} vs {r['away_name']})"
            )
        lines.append("")

    for match_id in sorted(matched.keys(), key=lambda x: matched[x][0]["kickoff_time"]):
        r, tm, method = matched[match_id]
        url = titan_url(tm["matchId"])
        lines.append(
            f"-- {r['kickoff_time']} {r['home_name']} vs {r['away_name']} "
            f"(titan {tm['matchId']}, {method})"
        )
        lines.append(
            f"UPDATE t_match SET map_tian_match_id = '{sql_escape(url)}', "
            f"updated_time = NOW() WHERE match_id = '{sql_escape(match_id)}';"
        )
        lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- ========== 未匹配 db 比赛 ==========")
    for r in unmatched_db:
        lines.append(
            f"-- match_id={r['match_id']} | {r['kickoff_time']} | "
            f"{r['home_name']} vs {r['away_name']} | R{r['round_number']} {r['round_group']}"
        )

    matched_titan_ids = {tm["matchId"] for _, tm, _ in matched.values()}
    matched_titan_ids.update(tm["matchId"] for _, tm in skipped_existing)
    unmatched_titan = [m for m in titan_matches if m["matchId"] not in matched_titan_ids]
    lines.append("")
    lines.append(f"-- ========== 未匹配 titan 比赛 ({len(unmatched_titan)} 场) ==========")
    for m in unmatched_titan:
        grp = m.get("group") or m.get("stageName", "")
        rnd = m.get("round") or ""
        lines.append(
            f"-- titan {m['matchId']} | {m['kickoff']} | {m['home']} vs {m['away']} | {grp} R{rnd}"
        )

    OUT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"matched={len(matched)} unmatched_db={len(unmatched_db)} unmatched_titan={len(unmatched_titan)}")
    print(f"written: {OUT_FILE}")


if __name__ == "__main__":
    main()
