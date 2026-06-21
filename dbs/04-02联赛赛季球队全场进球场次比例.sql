-- t_match：全场「本队至少进 1 球」场次比例（按联赛、赛季、球队）
-- 排序：主场进球场次占比 降序；同列下五大联赛 → 欧冠 → 欧联 → 其余；再赛季、球队名
-- 依赖：t_id, tn_name, t_season, match_id, home_id, away_id, home_name, away_name, final_score（固定「主队-客队」，与 dbs 内其它脚本一致）
-- 指标说明（每行：联赛+赛季+球队）：
--   有全场比分场次_*：该范围内有合法全场比分的场次数（本队作为主队/客队/合计）
--   全场进球场次_*：该队在该场次全场进球数 ≥1 的场次数
--   全场进球场次占比_*：全场进球场次 / 有全场比分场次（0～1，四位小数）
--
-- 筛选：以下变量任一为 NULL 或空字符串则不对该维度筛选。
--   @filter_t_id_list       联赛 ID，FIND_IN_SET
--   @filter_tn_name_list   联赛名称，FIND_IN_SET
--   @filter_t_season_list  赛季，FIND_IN_SET
--   @filter_team_id_list   球队 ID（home_id/away_id），FIND_IN_SET；NULL/空=不限
-- FIND_IN_SET 与列比较时统一 COLLATE，避免 1267

SET @filter_t_id_list := NULL;
SET @filter_tn_name_list := '英格兰超级联赛,西班牙甲组联赛,意大利甲组联赛,德国甲组联赛,法国甲组联赛';
SET @filter_t_season_list := '2025-26';
SET @filter_team_id_list := NULL;

WITH base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    home_id,
    away_id,
    home_name,
    away_name,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS ft_home,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS ft_away
  FROM t_match
  WHERE final_score IS NOT NULL
    AND CHAR_LENGTH(TRIM(final_score)) > 0
    AND final_score REGEXP '^[0-9]+-[0-9]+$'
    AND (
      @filter_t_id_list IS NULL
      OR CHAR_LENGTH(TRIM(IFNULL(@filter_t_id_list, ''))) = 0
      OR FIND_IN_SET(
        (t_id COLLATE utf8mb4_general_ci),
        CAST(IFNULL(@filter_t_id_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
      ) > 0
    )
    AND (
      @filter_tn_name_list IS NULL
      OR CHAR_LENGTH(TRIM(IFNULL(@filter_tn_name_list, ''))) = 0
      OR FIND_IN_SET(
        (tn_name COLLATE utf8mb4_general_ci),
        CAST(IFNULL(@filter_tn_name_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
      ) > 0
    )
    AND (
      @filter_t_season_list IS NULL
      OR CHAR_LENGTH(TRIM(IFNULL(@filter_t_season_list, ''))) = 0
      OR FIND_IN_SET(
        (t_season COLLATE utf8mb4_general_ci),
        CAST(IFNULL(@filter_t_season_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
      ) > 0
    )
),
normalized AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    home_id AS team_id,
    home_name AS team_name,
    ft_home AS ft_team_goals,
    1 AS is_home
  FROM base
  UNION ALL
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    away_id,
    away_name,
    ft_away,
    0 AS is_home
  FROM base
),
keyed AS (
  SELECT
    *,
    COALESCE(
      NULLIF(TRIM(team_id), ''),
      CONCAT('NAME|', IFNULL(team_name, ''))
    ) AS team_grp
  FROM normalized
),
norm_f AS (
  SELECT *
  FROM keyed
  WHERE
    (
      (team_name IS NOT NULL AND CHAR_LENGTH(TRIM(team_name)) > 0)
      OR (team_id IS NOT NULL AND CHAR_LENGTH(TRIM(team_id)) > 0)
    )
    AND (
      @filter_team_id_list IS NULL
      OR CHAR_LENGTH(TRIM(IFNULL(@filter_team_id_list, ''))) = 0
      OR (
        team_id IS NOT NULL
        AND CHAR_LENGTH(TRIM(team_id)) > 0
        AND FIND_IN_SET(
          (TRIM(team_id) COLLATE utf8mb4_general_ci),
          CAST(IFNULL(@filter_team_id_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
        ) > 0
      )
    )
),
team_stats AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    team_grp,
    MAX(NULLIF(TRIM(team_id), '')) AS team_id,
    MAX(team_name) AS team_name,
    COUNT(*) AS m_all,
    SUM(CASE WHEN ft_team_goals > 0 THEN 1 ELSE 0 END) AS s_all,
    SUM(CASE WHEN is_home = 1 THEN 1 ELSE 0 END) AS m_home,
    SUM(CASE WHEN is_home = 1 AND ft_team_goals > 0 THEN 1 ELSE 0 END) AS s_home,
    SUM(CASE WHEN is_home = 0 THEN 1 ELSE 0 END) AS m_away,
    SUM(CASE WHEN is_home = 0 AND ft_team_goals > 0 THEN 1 ELSE 0 END) AS s_away
  FROM norm_f
  GROUP BY t_id, tn_name, t_season, team_grp
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  team_id AS `球队ID`,
  team_name AS `球队`,
  m_home AS `有全场比分场次_主场`,
  s_home AS `全场进球场次_主场`,
  ROUND(s_home / NULLIF(m_home, 0), 4) AS `全场进球场次占比_主场`,
  m_away AS `有全场比分场次_客场`,
  s_away AS `全场进球场次_客场`,
  ROUND(s_away / NULLIF(m_away, 0), 4) AS `全场进球场次占比_客场`,
  m_all AS `有全场比分场次_全部`,
  s_all AS `全场进球场次_全部`,
  ROUND(s_all / NULLIF(m_all, 0), 4) AS `全场进球场次占比_全部`
FROM team_stats
ORDER BY
  `全场进球场次占比_主场` DESC,
  CASE tn_name
    WHEN '英格兰超级联赛' THEN 1
    WHEN '西班牙甲组联赛' THEN 2
    WHEN '意大利甲组联赛' THEN 3
    WHEN '德国甲组联赛' THEN 4
    WHEN '法国甲组联赛' THEN 5
    WHEN '欧洲冠军联赛' THEN 6
    WHEN '欧洲联赛' THEN 7
    ELSE 99
  END,
  tn_name,
  t_season,
  s_home DESC,
  m_home DESC,
  team_name;
