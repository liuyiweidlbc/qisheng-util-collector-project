-- 五大联赛 进球场次比例最高 + 最长连续进球场次（整体/主场/客场）
-- 按赛季，并输出联赛ID(t_id)与球队ID(home_id/away_id)

WITH base AS (
  SELECT
    t_id AS league_id,
    tn_name AS league_name,
    t_season AS season,
    match_id,
    home_id,
    home_name,
    away_id,
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
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *,
         CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag
  FROM normalized
)
, ordered AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, season, team_id
           ORDER BY order_ts IS NULL, order_ts, match_id
         ) AS seq_in_team
  FROM normalized_scored
)
-- 整体
, overall_stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, overall_marks AS (
  SELECT league_id, season, team_id, seq_in_team, scored_flag
       , SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, overall_over15_marks AS (
  SELECT league_id, season, team_id, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
)
, overall_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, season, team_id, zero_block, COUNT(*) AS streak_len
    FROM overall_marks
    WHERE scored_flag = 1
    GROUP BY league_id, season, team_id, zero_block
  ) s
  GROUP BY league_id, season, team_id
)
, overall_over15_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, season, team_id, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM overall_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_id, season, team_id, zero_block_over15
  ) x
  GROUP BY league_id, season, team_id
)
, overall_ranked AS (
  SELECT s.league_id, s.league_name, s.season, s.team_id, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_id, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM overall_stats s
  JOIN overall_streaks st
    ON s.league_id = st.league_id AND s.season = st.season AND s.team_id = st.team_id
  JOIN overall_over15_streaks st2
    ON s.league_id = st2.league_id AND s.season = st2.season AND s.team_id = st2.team_id
)
-- 主场
, home_stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  WHERE is_home = 1
  GROUP BY league_id, league_name, season, team_id, team_name
)
, home_marks AS (
  SELECT league_id, season, team_id, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
  WHERE is_home = 1
)
, home_over15_marks AS (
  SELECT league_id, season, team_id, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
  WHERE is_home = 1
)
, home_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, season, team_id, zero_block, COUNT(*) AS streak_len
    FROM home_marks
    WHERE scored_flag = 1
    GROUP BY league_id, season, team_id, zero_block
  ) s
  GROUP BY league_id, season, team_id
)
, home_over15_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, season, team_id, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM home_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_id, season, team_id, zero_block_over15
  ) x
  GROUP BY league_id, season, team_id
)
, home_ranked AS (
  SELECT s.league_id, s.league_name, s.season, s.team_id, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_id, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM home_stats s
  JOIN home_streaks st
    ON s.league_id = st.league_id AND s.season = st.season AND s.team_id = st.team_id
  JOIN home_over15_streaks st2
    ON s.league_id = st2.league_id AND s.season = st2.season AND s.team_id = st2.team_id
)
-- 客场
, away_stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  WHERE is_home = 0
  GROUP BY league_id, league_name, season, team_id, team_name
)
, away_marks AS (
  SELECT league_id, season, team_id, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
  WHERE is_home = 0
)
, away_over15_marks AS (
  SELECT league_id, season, team_id, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
  WHERE is_home = 0
)
, away_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, season, team_id, zero_block, COUNT(*) AS streak_len
    FROM away_marks
    WHERE scored_flag = 1
    GROUP BY league_id, season, team_id, zero_block
  ) s
  GROUP BY league_id, season, team_id
)
, away_over15_streaks AS (
  SELECT league_id, season, team_id, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, season, team_id, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM away_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_id, season, team_id, zero_block_over15
  ) x
  GROUP BY league_id, season, team_id
)
, away_ranked AS (
  SELECT s.league_id, s.league_name, s.season, s.team_id, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_id, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM away_stats s
  JOIN away_streaks st
    ON s.league_id = st.league_id AND s.season = st.season AND s.team_id = st.team_id
  JOIN away_over15_streaks st2
    ON s.league_id = st2.league_id AND s.season = st2.season AND s.team_id = st2.team_id
)
-- 为每个范围（整体/主场/客场）分别生成四种排行榜：进球比例/大1.5比例/连续进球/连续大1.5
, overall_rank_by_rate AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY scored_rate DESC, matches_total DESC, team_name
         ) AS rk2
  FROM overall_ranked
)
, overall_rank_by_over15 AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY over15_rate DESC, matches_total DESC, team_name
         ) AS rk2
  FROM overall_ranked
)
, overall_rank_by_streak AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_scored_streak DESC, matches_total DESC, team_name
         ) AS rk2
  FROM overall_ranked
)
, overall_rank_by_over15streak AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_over15_streak DESC, matches_total DESC, team_name
         ) AS rk2
  FROM overall_ranked
)
, home_rank_by_rate AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY scored_rate DESC, matches_total DESC, team_name) AS rk2
  FROM home_ranked
)
, home_rank_by_over15 AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY over15_rate DESC, matches_total DESC, team_name) AS rk2
  FROM home_ranked
)
, home_rank_by_streak AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_scored_streak DESC, matches_total DESC, team_name) AS rk2
  FROM home_ranked
)
, home_rank_by_over15streak AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_over15_streak DESC, matches_total DESC, team_name) AS rk2
  FROM home_ranked
)
, away_rank_by_rate AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY scored_rate DESC, matches_total DESC, team_name) AS rk2
  FROM away_ranked
)
, away_rank_by_over15 AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY over15_rate DESC, matches_total DESC, team_name) AS rk2
  FROM away_ranked
)
, away_rank_by_streak AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_scored_streak DESC, matches_total DESC, team_name) AS rk2
  FROM away_ranked
)
, away_rank_by_over15streak AS (
  SELECT *, ROW_NUMBER() OVER (
           PARTITION BY league_id, season
           ORDER BY longest_over15_streak DESC, matches_total DESC, team_name) AS rk2
  FROM away_ranked
)
SELECT 'overall' AS `范围`, '进球比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`,
       matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`,
       over15_matches AS `大1.5场次`, over15_rate AS `大1.5比例`,
       longest_scored_streak AS `最长连续进球场次`, longest_over15_streak AS `最长连续大1.5场次`
FROM overall_rank_by_rate WHERE rk2 <= 5
UNION ALL
SELECT 'overall', '大1.5比例TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM overall_rank_by_over15 WHERE rk2 <= 5
UNION ALL
SELECT 'overall', '连续进球TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM overall_rank_by_streak WHERE rk2 <= 5
UNION ALL
SELECT 'overall', '连续大1.5TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM overall_rank_by_over15streak WHERE rk2 <= 5
UNION ALL
SELECT 'home', '进球比例TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM home_rank_by_rate WHERE rk2 <= 5
UNION ALL
SELECT 'home', '大1.5比例TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM home_rank_by_over15 WHERE rk2 <= 5
UNION ALL
SELECT 'home', '连续进球TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM home_rank_by_streak WHERE rk2 <= 5
UNION ALL
SELECT 'home', '连续大1.5TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM home_rank_by_over15streak WHERE rk2 <= 5
UNION ALL
SELECT 'away', '进球比例TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM away_rank_by_rate WHERE rk2 <= 5
UNION ALL
SELECT 'away', '大1.5比例TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM away_rank_by_over15 WHERE rk2 <= 5
UNION ALL
SELECT 'away', '连续进球TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM away_rank_by_streak WHERE rk2 <= 5
UNION ALL
SELECT 'away', '连续大1.5TOP5', league_id, league_name, season,
       team_id, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM away_rank_by_over15streak WHERE rk2 <= 5
ORDER BY `赛季`, `范围`, `指标`, `联赛`, `球队`;


-- =============================================
-- 以下为分拆版：12条独立查询（可分别执行）
-- overall/home/away × 进球比例/大1.5比例/连续进球/连续大1.5
-- 每条均自带CTE，互不依赖
-- =============================================

-- 1) 整体 - 进球比例TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY scored_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'overall' AS `范围`, '进球比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `进球比例` DESC, `总场次` DESC, `球队`;

-- 2) 整体 - 大1.5比例TOP5（单队进球≥2）
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY over15_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'overall' AS `范围`, '大1.5比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, over15_matches AS `大1.5场次`, over15_rate AS `大1.5比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `大1.5比例` DESC, `总场次` DESC, `球队`;

-- 3) 整体 - 连续进球TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE scored_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_scored_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'overall' AS `范围`, '连续进球TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_scored_streak AS `最长连续进球场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续进球场次` DESC, `球队`;

-- 4) 整体 - 连续大1.5TOP5（单队进球≥2）
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE over15_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_over15_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'overall' AS `范围`, '连续大1.5TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_over15_streak AS `最长连续大1.5场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续大1.5场次` DESC, `球队`;

-- 5) 主场 - 进球比例TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY scored_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'home' AS `范围`, '进球比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `进球比例` DESC, `总场次` DESC, `球队`;

-- 6) 主场 - 大1.5比例TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY over15_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'home' AS `范围`, '大1.5比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, over15_matches AS `大1.5场次`, over15_rate AS `大1.5比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `大1.5比例` DESC, `总场次` DESC, `球队`;

-- 7) 主场 - 连续进球TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE scored_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_scored_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'home' AS `范围`, '连续进球TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_scored_streak AS `最长连续进球场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续进球场次` DESC, `球队`;

-- 8) 主场 - 连续大1.5TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         home_id AS team_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE over15_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_over15_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'home' AS `范围`, '连续大1.5TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_over15_streak AS `最长连续大1.5场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续大1.5场次` DESC, `球队`;

-- 9) 客场 - 进球比例TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY scored_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'away' AS `范围`, '进球比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `进球比例` DESC, `总场次` DESC, `球队`;

-- 10) 客场 - 大1.5比例TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, stats AS (
  SELECT league_id, league_name, season, team_id, team_name,
         COUNT(*) AS matches_total,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY over15_rate DESC, matches_total DESC, team_name) AS rk
  FROM stats
)
SELECT 'away' AS `范围`, '大1.5比例TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, matches_total AS `总场次`, over15_matches AS `大1.5场次`, over15_rate AS `大1.5比例`
FROM ranks WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `大1.5比例` DESC, `总场次` DESC, `球队`;

-- 11) 客场 - 连续进球TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *, CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag FROM normalized
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized_scored
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE scored_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_scored_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'away' AS `范围`, '连续进球TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_scored_streak AS `最长连续进球场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续进球场次` DESC, `球队`;

-- 12) 客场 - 连续大1.5TOP5
WITH base AS (
  SELECT t_id AS league_id, tn_name AS league_name, t_season AS season,
         match_id, home_id, home_name, away_id, away_name,
         CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
         CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals,
         COALESCE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y/%m/%d %H:%i:%s'), STR_TO_DATE(kickoff_time, '%Y-%m-%d'), STR_TO_DATE(kickoff_time, '%Y/%m/%d')) AS kickoff_ts,
         kickoff_time AS kickoff_raw
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
)
, normalized AS (
  SELECT league_id, league_name, season, match_id,
         away_id AS team_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season, team_id ORDER BY order_ts IS NULL, order_ts, match_id) AS seq_in_team
  FROM normalized
)
, marks AS (
  SELECT league_id, league_name, season, team_id, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_id, season, team_id ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, streaks AS (
  SELECT league_id, league_name, season, team_id, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_id, league_name, season, team_id, team_name, zero_block, COUNT(*) AS streak_len
    FROM marks
    WHERE over15_flag = 1
    GROUP BY league_id, league_name, season, team_id, team_name, zero_block
  ) x
  GROUP BY league_id, league_name, season, team_id, team_name
)
, ranks AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY league_id, season ORDER BY longest_over15_streak DESC, team_name) AS rk
  FROM streaks
)
SELECT 'away' AS `范围`, '连续大1.5TOP5' AS `指标`, league_id AS `联赛ID`, league_name AS `联赛`, season AS `赛季`,
       team_id AS `球队ID`, team_name AS `球队`, longest_over15_streak AS `最长连续大1.5场次`
FROM ranks
WHERE rk <= 5
ORDER BY `赛季`, `联赛`, `最长连续大1.5场次` DESC, `球队`;

-- 五大联赛 进球场次比例最高 + 最长连续进球场次（整体/主场/客场）
-- 依赖表：t_match（字段：tn_name, match_id, home_name, away_name, final_score, kickoff_time）
-- 说明：
-- 1) 五大联赛名称按你库中中文值过滤：英格兰超级联赛/西班牙甲组联赛/意大利甲组联赛/德国甲组联赛/法国甲组联赛
-- 2) 比分格式假定为 "2-1"（如存在空格或中文冒号，可按需在 WHERE/解析处先 REPLACE 预处理）

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
)
, normalized AS (
  SELECT league_name, season, match_id, home_name AS team_name, 1 AS is_home,
         home_goals AS team_goals, away_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
  UNION ALL
  SELECT league_name, season, match_id, away_name AS team_name, 0 AS is_home,
         away_goals AS team_goals, home_goals AS opp_goals,
         COALESCE(kickoff_ts, STR_TO_DATE(kickoff_raw, '%Y-%m-%d %H:%i:%s')) AS order_ts
  FROM base
)
, normalized_scored AS (
  SELECT *,
         CASE WHEN team_goals > 0 THEN 1 ELSE 0 END AS scored_flag
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
-- 整体
, overall_stats AS (
  SELECT league_name, season, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
         ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
         SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
         ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  GROUP BY league_name, season, team_name
)
, overall_marks AS (
  SELECT league_name, season, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block
  FROM ordered
)
, overall_over15_marks AS (
  SELECT league_name, season, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
)
, overall_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_name, season, team_name, zero_block, COUNT(*) AS streak_len
    FROM overall_marks
    WHERE scored_flag = 1
    GROUP BY league_name, season, team_name, zero_block
  ) s
  GROUP BY league_name, season, team_name
)
, overall_over15_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_name, season, team_name, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM overall_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_name, season, team_name, zero_block_over15
  ) x
  GROUP BY league_name, season, team_name
)
, overall_ranked AS (
  SELECT s.league_name, s.season, s.team_name, s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_name, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM overall_stats s
  JOIN overall_streaks st
    ON s.league_name = st.league_name AND s.season = st.season AND s.team_name = st.team_name
  JOIN overall_over15_streaks st2
    ON s.league_name = st2.league_name AND s.season = st2.season AND s.team_name = st2.team_name
)
-- 主场
, home_stats AS (
  SELECT league_name, season, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
          ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
          SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
          ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  WHERE is_home = 1
  GROUP BY league_name, season, team_name
)
, home_marks AS (
  SELECT league_name, season, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block
  FROM ordered
  WHERE is_home = 1
)
, home_over15_marks AS (
  SELECT league_name, season, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
  WHERE is_home = 1
)
, home_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_name, season, team_name, zero_block, COUNT(*) AS streak_len
    FROM home_marks
    WHERE scored_flag = 1
    GROUP BY league_name, season, team_name, zero_block
  ) s
  GROUP BY league_name, season, team_name
)
, home_over15_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_name, season, team_name, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM home_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_name, season, team_name, zero_block_over15
  ) x
  GROUP BY league_name, season, team_name
)
, home_ranked AS (
  SELECT s.league_name, s.season, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_name, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM home_stats s
  JOIN home_streaks st
    ON s.league_name = st.league_name AND s.season = st.season AND s.team_name = st.team_name
  JOIN home_over15_streaks st2
    ON s.league_name = st2.league_name AND s.season = st2.season AND s.team_name = st2.team_name
)
-- 客场
, away_stats AS (
  SELECT league_name, season, team_name,
         COUNT(*) AS matches_total,
         SUM(scored_flag) AS matches_scored,
          ROUND(SUM(scored_flag)/COUNT(*), 4) AS scored_rate,
          SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) AS over15_matches,
          ROUND(SUM(CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END)/COUNT(*), 4) AS over15_rate
  FROM ordered
  WHERE is_home = 0
  GROUP BY league_name, season, team_name
)
, away_marks AS (
  SELECT league_name, season, team_name, seq_in_team, scored_flag,
         SUM(CASE WHEN scored_flag = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block
  FROM ordered
  WHERE is_home = 0
)
, away_over15_marks AS (
  SELECT league_name, season, team_name, seq_in_team,
         CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END AS over15_flag,
         SUM(CASE WHEN (CASE WHEN team_goals >= 2 THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END)
           OVER (PARTITION BY league_name, season, team_name ORDER BY seq_in_team) AS zero_block_over15
  FROM ordered
  WHERE is_home = 0
)
, away_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_scored_streak
  FROM (
    SELECT league_name, season, team_name, zero_block, COUNT(*) AS streak_len
    FROM away_marks
    WHERE scored_flag = 1
    GROUP BY league_name, season, team_name, zero_block
  ) s
  GROUP BY league_name, season, team_name
)
, away_over15_streaks AS (
  SELECT league_name, season, team_name, MAX(streak_len) AS longest_over15_streak
  FROM (
    SELECT league_name, season, team_name, zero_block_over15 AS zb, COUNT(*) AS streak_len
    FROM away_over15_marks
    WHERE over15_flag = 1
    GROUP BY league_name, season, team_name, zero_block_over15
  ) x
  GROUP BY league_name, season, team_name
)
, away_ranked AS (
  SELECT s.league_name, s.season, s.team_name,
         s.matches_total, s.matches_scored, s.scored_rate,
         s.over15_matches, s.over15_rate,
         st.longest_scored_streak, st2.longest_over15_streak,
         ROW_NUMBER() OVER (
           PARTITION BY s.league_name, s.season
           ORDER BY s.scored_rate DESC, s.matches_total DESC, s.team_name
         ) AS rk
  FROM away_stats s
  JOIN away_streaks st
    ON s.league_name = st.league_name AND s.season = st.season AND s.team_name = st.team_name
  JOIN away_over15_streaks st2
    ON s.league_name = st2.league_name AND s.season = st2.season AND s.team_name = st2.team_name
)
SELECT 'overall' AS `范围`, league_name AS `联赛`, season AS `赛季`, team_name AS `球队`,
       matches_total AS `总场次`, matches_scored AS `进球场次`, scored_rate AS `进球比例`,
       over15_matches AS `大1.5场次`, over15_rate AS `大1.5比例`,
       longest_scored_streak AS `最长连续进球场次`, longest_over15_streak AS `最长连续大1.5场次`
FROM overall_ranked WHERE rk <= 5
UNION ALL
SELECT 'home', league_name, season, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM home_ranked WHERE rk <= 5
UNION ALL
SELECT 'away', league_name, season, team_name,
       matches_total, matches_scored, scored_rate,
       over15_matches, over15_rate,
       longest_scored_streak, longest_over15_streak
FROM away_ranked WHERE rk <= 5
ORDER BY `赛季`, `范围`, `联赛`, `进球比例` DESC, `总场次` DESC, `球队`;


