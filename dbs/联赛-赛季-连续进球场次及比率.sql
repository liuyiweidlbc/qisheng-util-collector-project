-- 五大联赛 - 2025-26赛季 - 连续进球场次及比率 前7名（整体）
-- 依赖表：t_match（字段：tn_name, t_season, match_id, home_name, away_name, final_score, kickoff_time）

WITH base AS (
  SELECT
    tn_name AS league_name,
    t_season AS season,
    match_id,
    home_name,
    away_name,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
    COALESCE(
      STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'),
      STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'),
      STR_TO_DATE(kickoff_time, '%Y-%m-%d'),
      STR_TO_DATE(kickoff_time, '%Y/%m/%d')
    ) AS kickoff_ts,
    kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
    AND t_season IN ('2025-26','2025/26','2025-2026','2025/2026')
)
, normalized AS (
  SELECT league_name, season, match_id,
         home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_name, season, match_id,
         away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag
  FROM normalized
)
, ordered AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_name, season, team_name
           ORDER BY order_ts IS NULL, order_ts, match_id
         ) AS seq_in_team
  FROM normalized_scored
)
, stats AS (
  SELECT league_name, season, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate
  FROM ordered
  GROUP BY league_name, season, team_name
)
, marks AS (
  SELECT league_name, season, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_name, season, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE scored_flag = 1
    GROUP BY league_name, season, team_name, zero_block
  ) x
  GROUP BY league_name, season, team_name
)
, ranked AS (
  SELECT s.league_name, s.season, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         st.longest_scored_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_name, s.season
           ORDER BY st.longest_scored_streak DESC, s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM stats s
  JOIN streaks st
    ON s.league_name = st.league_name
   AND s.season = st.season
   AND s.team_name = st.team_name
)
SELECT league_name AS `联赛`, season AS `赛季`, team_name AS `球队`,
       matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`,
       longest_scored_streak AS `最长连续进球场次`
FROM ranked
WHERE rk <= 7
ORDER BY `联赛`, `最长连续进球场次` DESC, `进球比例` DESC, `总场次` DESC, `球队`;


