WITH base AS (
  SELECT
    tn_name AS league_name,
    t_season AS season,
    match_id,
    home_name,
    away_name,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals
  FROM t_match
  WHERE final_score REGEXP '^[0-9]+-[0-9]+$'
    AND tn_name IN ('英格兰超级联赛','西班牙甲组联赛','意大利甲组联赛','德国甲组联赛','法国甲组联赛')
    AND t_season = '2025-26'
),
normalized AS (
  SELECT league_name, season, match_id,
         home_name AS team_name, home_goals AS team_goals
  FROM base
  UNION ALL
  SELECT league_name, season, match_id,
         away_name AS team_name, away_goals AS team_goals
  FROM base
),
team_scored AS (
  SELECT
    league_name,
    season,
    team_name,
    COUNT(*) AS matches_total,
    SUM(CASE WHEN team_goals > 0 THEN 1 ELSE 0 END) AS matches_scored
  FROM normalized
  GROUP BY league_name, season, team_name
)
SELECT
  season AS `赛季`,
  league_name AS `联赛`,
  team_name AS `球队`,
  matches_total AS `总场次`,
  matches_scored AS `进球场次`
FROM team_scored
ORDER BY matches_scored DESC, matches_total DESC, team_name
LIMIT 7;