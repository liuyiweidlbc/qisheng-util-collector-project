-- t_match：上半场进球场次统计（按联赛、赛季、球队）
-- 排序：五大联赛 → 欧冠(欧洲冠军联赛) → 欧联(欧洲联赛) → 其余联赛按名称
-- 依赖字段：t_id, tn_name, t_season, match_id, home_name, away_name, ht_score（默认按「主队-客队」解析，见 @ht_score_is_home_left）
-- 指标说明（汇总每行：联赛+赛季+球队；全部/主场/客场各占一组列）：
--   有半场比分场次_*：该范围内有合法半场比分的场次数
--   上半场进球场次_*：该范围内该队上半场至少进 1 球的场次数
--   上半场进球场次占比_*：上半场进球场次 / 有半场比分场次
--
-- 筛选：以下变量任一为 NULL 或空字符串则不对该维度筛选（查全部）。
--   多个值用英文逗号分隔，中间不要空格（例：'英超,西甲' 而非 '英超, 西甲'）。
--   @filter_t_id_list      联赛 ID 列表，对应 t_id
--   @filter_tn_name_list  联赛名称列表，对应 tn_name（可与 ID 列表同时设，同时满足 AND）
--   @filter_t_season_list  赛季列表，对应 t_season（例：'2024-25,2025-26'）
--   @filter_team_name_list 仅用于下方「明细」查询：球队名称列表；NULL/空=不限球队
--   @ht_score_is_home_left 半场比分方向：1（默认）=「主队进球-客队进球」；0 =「客队进球-主队进球」（与数据源不一致时再改）
-- FIND_IN_SET 与列比较时统一 COLLATE，避免 1267（Illegal mix of collations）

SET @filter_t_id_list := NULL;
SET @filter_tn_name_list := '英格兰超级联赛1,德国甲组联赛';
SET @filter_t_season_list := '2025-26';
SET @filter_team_name_list := '拜仁慕尼黑';
SET @ht_score_is_home_left := NULL;

-- 示例：五大联赛 + 欧冠欧联，两个赛季
-- SET @filter_tn_name_list := '英格兰超级联赛,西班牙甲组联赛,意大利甲组联赛,德国甲组联赛,法国甲组联赛,欧洲冠军联赛,欧洲联赛';
-- SET @filter_t_season_list := '2024-25,2025-26';

WITH base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    home_name,
    away_name,
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
normalized AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    home_name AS team_name,
    ht_home AS ht_team_goals,
    1 AS is_home
  FROM base
  UNION ALL
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    away_name,
    ht_away,
    0 AS is_home
  FROM base
),
norm_f AS (
  SELECT *
  FROM normalized
  WHERE team_name IS NOT NULL AND CHAR_LENGTH(TRIM(team_name)) > 0
),
team_stats AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    team_name,
    COUNT(*) AS m_all,
    SUM(CASE WHEN ht_team_goals > 0 THEN 1 ELSE 0 END) AS s_all,
    SUM(CASE WHEN is_home = 1 THEN 1 ELSE 0 END) AS m_home,
    SUM(CASE WHEN is_home = 1 AND ht_team_goals > 0 THEN 1 ELSE 0 END) AS s_home,
    SUM(CASE WHEN is_home = 0 THEN 1 ELSE 0 END) AS m_away,
    SUM(CASE WHEN is_home = 0 AND ht_team_goals > 0 THEN 1 ELSE 0 END) AS s_away
  FROM norm_f
  GROUP BY t_id, tn_name, t_season, team_name
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  team_name AS `球队`,
  m_all AS `有半场比分场次_全部`,
  s_all AS `上半场进球场次_全部`,
  ROUND(s_all / NULLIF(m_all, 0), 4) AS `上半场进球场次占比_全部`,
  m_home AS `有半场比分场次_主场`,
  s_home AS `上半场进球场次_主场`,
  ROUND(s_home / NULLIF(m_home, 0), 4) AS `上半场进球场次占比_主场`,
  m_away AS `有半场比分场次_客场`,
  s_away AS `上半场进球场次_客场`,
  ROUND(s_away / NULLIF(m_away, 0), 4) AS `上半场进球场次占比_客场`
FROM team_stats
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
  t_season,
  s_all DESC,
  m_all DESC,
  team_name;

-- ---------------------------------------------------------------------------
-- 明细：联赛、赛季、轮次、目标球队/主队/客队；每场该队一行（主队视角一行 + 客队视角一行）
-- 含：球队上半进球、上半总进球（主队半场进球+客队半场进球）
-- 例：半场「1-0」且默认主-左时 = 主队进 1、客队进 0；拜仁作客则「球队上半进球」=0、「是否」=否，与 JSON 一致属正常
-- 排序：勿把「全体主行」排在「全体客行」之前，否则分页/截断时会误以为「只有主场」。
--       当前：联赛→赛季→轮次数值 round_sort→目标球队→主客序 sort_ha（同队主在前、客在后）→开赛时间
-- 与汇总共用 @filter_t_id_list / @filter_tn_name_list / @filter_t_season_list；明细另可用 @filter_team_name_list
-- ---------------------------------------------------------------------------
WITH detail_base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    round_number,
    match_id,
    kickoff_time,
    home_name,
    ht_score,
    away_name,
    final_score,
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
-- detail_rows：UNION 两段列顺序必须与「主队」段一致（含 match_home→ht_score→match_away→team_name），否则 team_name 错位会导致 @filter_team_name_list 筛掉客场行
detail_rows AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    round_number,
    CASE
      WHEN TRIM(IFNULL(round_number, '')) REGEXP '^[0-9]+$'
      THEN CAST(TRIM(round_number) AS UNSIGNED)
      WHEN TRIM(IFNULL(round_number, '')) REGEXP '[0-9]+'
      THEN CAST(REGEXP_SUBSTR(TRIM(round_number), '[0-9]+') AS UNSIGNED)
      ELSE 999999
    END AS round_sort,
    match_id,
    kickoff_time,
    home_name AS match_home,
    ht_score,
    away_name AS match_away,
    home_name AS team_name,
    '主' AS `主客`,
    1 AS sort_ha,
    ht_home AS `球队上半进球`,
    ht_home + ht_away AS `上半总进球`,
    final_score
  FROM detail_base
  UNION ALL
  SELECT
    t_id,
    tn_name,
    t_season,
    round_number,
    CASE
      WHEN TRIM(IFNULL(round_number, '')) REGEXP '^[0-9]+$'
      THEN CAST(TRIM(round_number) AS UNSIGNED)
      WHEN TRIM(IFNULL(round_number, '')) REGEXP '[0-9]+'
      THEN CAST(REGEXP_SUBSTR(TRIM(round_number), '[0-9]+') AS UNSIGNED)
      ELSE 999999
    END,
    match_id,
    kickoff_time,
    home_name AS match_home,
    ht_score,
    away_name AS match_away,
    away_name AS team_name,
    '客' AS `主客`,
    2 AS sort_ha,
    ht_away AS `球队上半进球`,
    ht_home + ht_away AS `上半总进球`,
    final_score
  FROM detail_base
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  round_number AS `轮次`,
  team_name AS `目标球队`,
  match_home AS `主队`,
  ht_score AS `半场比分`,
  match_away AS `客队`,
  `主客`,
  `球队上半进球`,
  `上半总进球`,
  CASE WHEN `球队上半进球` > 0 THEN '是' ELSE '否' END AS `该队上半场是否进球`,
  CASE WHEN `球队上半进球` > 0 THEN 1 ELSE 0 END AS `该队上半场是否进球_数值`,
  final_score AS `全场比分`,
  match_id AS `比赛ID`,
  kickoff_time AS `开赛时间`
FROM detail_rows
WHERE team_name IS NOT NULL
  AND CHAR_LENGTH(TRIM(team_name)) > 0
  AND (
    @filter_team_name_list IS NULL
    OR CHAR_LENGTH(TRIM(IFNULL(@filter_team_name_list, ''))) = 0
    OR FIND_IN_SET(
      (TRIM(team_name) COLLATE utf8mb4_general_ci),
      CAST(IFNULL(@filter_team_name_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
    ) > 0
  )
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
  t_season,
  round_sort,
  round_number,
  team_name,
  sort_ha,
  kickoff_time DESC,
  match_id;

-- ---------------------------------------------------------------------------
-- 可选：仅列出「上半场曾有进球」的比赛明细（任一方上半场进球），仍按联赛展示
-- （与上文共用 @filter_t_id_list / @filter_tn_name_list / @filter_t_season_list，先执行 SET 再跑本段）
-- ---------------------------------------------------------------------------
-- SELECT
--   t_id AS `联赛ID`,
--   tn_name AS `联赛`,
--   t_season AS `赛季`,
--   match_id,
--   kickoff_time,
--   home_name,
--   away_name,
--   ht_score AS `半场比分`,
--   final_score AS `全场比分`
-- FROM t_match
-- WHERE ht_score IS NOT NULL
--   AND CHAR_LENGTH(TRIM(ht_score)) > 0
--   AND ht_score REGEXP '^[0-9]+-[0-9]+$'
--   AND (
--     @filter_t_id_list IS NULL
--     OR CHAR_LENGTH(TRIM(IFNULL(@filter_t_id_list, ''))) = 0
--     OR FIND_IN_SET(
--       (t_id COLLATE utf8mb4_general_ci),
--       CAST(IFNULL(@filter_t_id_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
--     ) > 0
--   )
--   AND (
--     @filter_tn_name_list IS NULL
--     OR CHAR_LENGTH(TRIM(IFNULL(@filter_tn_name_list, ''))) = 0
--     OR FIND_IN_SET(
--       (tn_name COLLATE utf8mb4_general_ci),
--       CAST(IFNULL(@filter_tn_name_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
--     ) > 0
--   )
--   AND (
--     @filter_t_season_list IS NULL
--     OR CHAR_LENGTH(TRIM(IFNULL(@filter_t_season_list, ''))) = 0
--     OR FIND_IN_SET(
--       (t_season COLLATE utf8mb4_general_ci),
--       CAST(IFNULL(@filter_t_season_list, '') AS CHAR(12000) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci
--     ) > 0
--   )
--   AND (CAST(SUBSTRING_INDEX(ht_score, '-', 1) AS SIGNED)
--        + CAST(SUBSTRING_INDEX(ht_score, '-', -1) AS SIGNED)) > 0
-- ORDER BY
--   CASE tn_name
--     WHEN '英格兰超级联赛' THEN 1
--     WHEN '西班牙甲组联赛' THEN 2
--     WHEN '意大利甲组联赛' THEN 3
--     WHEN '德国甲组联赛' THEN 4
--     WHEN '法国甲组联赛' THEN 5
--     WHEN '欧洲冠军联赛' THEN 6
--     WHEN '欧洲联赛' THEN 7
--     ELSE 99
--   END,
--   tn_name,
--   kickoff_time DESC,
--   match_id;
