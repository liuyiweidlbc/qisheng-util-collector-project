-- 联赛维度：上半场「有进球」统计 + 下半场「有进球」统计（每场各计一行）
-- 原在 dbs\五大联赛球队搜索.sql 文末，独立成文件便于单独执行
-- 依赖：t_match（t_id, tn_name, t_season, match_id, ht_score, final_score）
-- 下半场：由全场 − 半场推算，clean 规则与 dbs\五大联赛特征分析.sql 第 3）段一致
--
-- 筛选：任一为 NULL 或空字符串则不对该维度筛选（与球队搜索脚本同口径）
--   @filter_t_id_list        联赛 ID，FIND_IN_SET
--   @filter_tn_name_list     联赛名称，FIND_IN_SET
--   @filter_t_season_list    赛季，FIND_IN_SET
--   @ht_score_is_home_left   半场方向：1（默认）=「主队-客队」；0 =「客队-主队」；全场 final_score 固定「主队-客队」
-- FIND_IN_SET 与列比较时统一 COLLATE，避免 1267

SET @filter_t_id_list := NULL;
SET @filter_tn_name_list := '英格兰超级联赛,西班牙甲组联赛,意大利甲组联赛,德国甲组联赛,法国甲组联赛';
SET @filter_t_season_list := '2025-26';
SET @ht_score_is_home_left := NULL;

-- ---------------------------------------------------------------------------
-- 1）按联赛、赛季：上半场是否有进球及半场比分结构
-- ---------------------------------------------------------------------------
WITH league_base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    CASE
      WHEN IFNULL(@ht_score_is_home_left, 1) = 1
      THEN CAST(SUBSTRING_INDEX(ht_score, '-', 1) AS SIGNED)
      ELSE CAST(SUBSTRING_INDEX(ht_score, '-', -1) AS SIGNED)
    END AS ht_home,
    CASE
      WHEN IFNULL(@ht_score_is_home_left, 1) = 1
      THEN CAST(SUBSTRING_INDEX(ht_score, '-', -1) AS SIGNED)
      ELSE CAST(SUBSTRING_INDEX(ht_score, '-', 1) AS SIGNED)
    END AS ht_away
  FROM t_match
  WHERE ht_score IS NOT NULL
    AND CHAR_LENGTH(TRIM(ht_score)) > 0
    AND ht_score REGEXP '^[0-9]+-[0-9]+$'
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
league_agg AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    COUNT(*) AS m_ht_valid,
    SUM(CASE WHEN ht_home + ht_away > 0 THEN 1 ELSE 0 END) AS s_ht_any,
    SUM(CASE WHEN ht_home + ht_away = 0 THEN 1 ELSE 0 END) AS s_ht_0_0,
    SUM(CASE WHEN ht_home > 0 AND ht_away = 0 THEN 1 ELSE 0 END) AS s_ht_only_home,
    SUM(CASE WHEN ht_away > 0 AND ht_home = 0 THEN 1 ELSE 0 END) AS s_ht_only_away,
    SUM(CASE WHEN ht_home > 0 AND ht_away > 0 THEN 1 ELSE 0 END) AS s_ht_both,
    SUM(ht_home + ht_away) AS sum_ht_goals,
    AVG((ht_home + ht_away) * 1.0) AS avg_ht_total
  FROM league_base
  GROUP BY t_id, tn_name, t_season
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  m_ht_valid AS `有半场比分场次`,
  s_ht_any AS `上半场有进球场次_任一方`,
  ROUND(100 * s_ht_any / NULLIF(m_ht_valid, 0), 2) AS `上半场有进球占比%`,
  s_ht_0_0 AS `上半场闷局场次`,
  ROUND(100 * s_ht_0_0 / NULLIF(m_ht_valid, 0), 2) AS `上半场闷局占比%`,
  s_ht_only_home AS `半场仅主队进球场次`,
  s_ht_only_away AS `半场仅客队进球场次`,
  s_ht_both AS `半场双方都有进球场次`,
  sum_ht_goals AS `上半总进球合计`,
  ROUND(avg_ht_total, 4) AS `场均上半总进球`,
  ROUND(sum_ht_goals / NULLIF(s_ht_any, 0), 4) AS `有球场次场均上半总进球`
FROM league_agg
ORDER BY
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
  t_season;

-- ---------------------------------------------------------------------------
-- 2）按联赛、赛季：下半场是否有进球（全场−半场，clean 后每场一行）
-- ---------------------------------------------------------------------------
WITH sh_base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS ft_home,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS ft_away,
    CASE
      WHEN IFNULL(@ht_score_is_home_left, 1) = 1
      THEN CAST(SUBSTRING_INDEX(ht_score, '-', 1) AS SIGNED)
      ELSE CAST(SUBSTRING_INDEX(ht_score, '-', -1) AS SIGNED)
    END AS ht_home,
    CASE
      WHEN IFNULL(@ht_score_is_home_left, 1) = 1
      THEN CAST(SUBSTRING_INDEX(ht_score, '-', -1) AS SIGNED)
      ELSE CAST(SUBSTRING_INDEX(ht_score, '-', 1) AS SIGNED)
    END AS ht_away
  FROM t_match
  WHERE final_score IS NOT NULL
    AND CHAR_LENGTH(TRIM(final_score)) > 0
    AND final_score REGEXP '^[0-9]+-[0-9]+$'
    AND ht_score IS NOT NULL
    AND CHAR_LENGTH(TRIM(ht_score)) > 0
    AND ht_score REGEXP '^[0-9]+-[0-9]+$'
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
sh_clean AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    ft_home - ht_home AS sh_home,
    ft_away - ht_away AS sh_away
  FROM sh_base
  WHERE ht_home <= ft_home
    AND ht_away <= ft_away
    AND (ft_home - ht_home) >= 0
    AND (ft_away - ht_away) >= 0
),
sh_agg AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    COUNT(*) AS m_sh_valid,
    SUM(CASE WHEN sh_home + sh_away > 0 THEN 1 ELSE 0 END) AS s_sh_any,
    SUM(CASE WHEN sh_home + sh_away = 0 THEN 1 ELSE 0 END) AS s_sh_0_0,
    SUM(CASE WHEN sh_home > 0 AND sh_away = 0 THEN 1 ELSE 0 END) AS s_sh_only_home,
    SUM(CASE WHEN sh_away > 0 AND sh_home = 0 THEN 1 ELSE 0 END) AS s_sh_only_away,
    SUM(CASE WHEN sh_home > 0 AND sh_away > 0 THEN 1 ELSE 0 END) AS s_sh_both,
    SUM(sh_home + sh_away) AS sum_sh_goals,
    AVG((sh_home + sh_away) * 1.0) AS avg_sh_total
  FROM sh_clean
  GROUP BY t_id, tn_name, t_season
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  m_sh_valid AS `可推算下半场场次`,
  s_sh_any AS `下半场有进球场次_任一方`,
  ROUND(100 * s_sh_any / NULLIF(m_sh_valid, 0), 2) AS `下半场有进球占比%`,
  s_sh_0_0 AS `下半场闷局场次`,
  ROUND(100 * s_sh_0_0 / NULLIF(m_sh_valid, 0), 2) AS `下半场闷局占比%`,
  s_sh_only_home AS `下半仅主队进球场次`,
  s_sh_only_away AS `下半仅客队进球场次`,
  s_sh_both AS `下半双方都有进球场次`,
  sum_sh_goals AS `下半总进球合计`,
  ROUND(avg_sh_total, 4) AS `场均下半总进球`,
  ROUND(sum_sh_goals / NULLIF(s_sh_any, 0), 4) AS `有球场次场均下半总进球`
FROM sh_agg
ORDER BY
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
  t_season;
