-- 按 联赛、赛季、轮次 计算场均积分 + 同条件下比分明细（用于手算核对）
-- 场均积分口径与「五大联赛特征分析.sql」一致：每场产出总积分 = 分胜负 3、平局 2，再 / 该轮有效场次数。
-- 轮次积分（平均）：同一联赛、赛季内，各轮「本轮产出积分合计」的算术平均（每轮一行算一个值再平均，与轮内场次多少无关）。
-- 筛选变量与主脚本相同；按需修改后分别执行「一」「二」两段。

SET @filter_t_id_list := NULL;
SET @filter_tn_name_list := '英格兰超级联赛,西班牙甲组联赛,意大利甲组联赛,德国甲组联赛,法国甲组联赛';
SET @filter_t_season_list := '2025-26';

-- =============================================================================
-- 一）按 联赛、赛季、轮次：场均积分（及可核对字段）
-- =============================================================================
WITH base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    round_number,
    NULLIF(TRIM(round_number), '') AS rn_key,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals
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
by_round AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    rn_key,
    COUNT(*) AS n_matches,
    SUM(CASE WHEN home_goals = away_goals THEN 1 ELSE 0 END) AS n_draws,
    SUM(CASE WHEN home_goals = away_goals THEN 2 ELSE 3 END) AS round_pts_total
  FROM base
  GROUP BY t_id, tn_name, t_season, rn_key
)
SELECT
  t_id AS `联赛ID`,
  tn_name AS `联赛`,
  t_season AS `赛季`,
  IFNULL(rn_key, '(空)') AS `轮次`,
  n_matches AS `有效比分场次`,
  n_draws AS `平局场次`,
  n_matches - n_draws AS `分胜负场次`,
  round_pts_total AS `本轮产出积分合计`,
  ROUND((3 * n_matches - n_draws) * 1.0 / n_matches, 4) AS `场均积分`,
  ROUND(
    AVG(round_pts_total) OVER (PARTITION BY t_id, tn_name, t_season),
    4
  ) AS `轮次积分（平均）`
FROM by_round
ORDER BY tn_name, t_season,
  CASE
    WHEN rn_key IS NULL THEN 1
    ELSE 0
  END,
  CASE
    WHEN rn_key REGEXP '^[0-9]+$' THEN CAST(rn_key AS UNSIGNED)
    ELSE 999999
  END,
  rn_key;

-- =============================================================================
-- 二）同筛选条件下的比分明细（逐场核对：本场产出总积分、累计可还原场均）
-- =============================================================================
WITH base AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    match_id,
    round_number,
    NULLIF(TRIM(round_number), '') AS rn_key,
    final_score,
    CAST(SUBSTRING_INDEX(final_score, '-', 1) AS SIGNED) AS home_goals,
    CAST(SUBSTRING_INDEX(final_score, '-', -1) AS SIGNED) AS away_goals
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
round_totals AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    rn_key,
    SUM(CASE WHEN home_goals = away_goals THEN 2 ELSE 3 END) AS round_pts_total
  FROM base
  GROUP BY t_id, tn_name, t_season, rn_key
),
season_round_pts_avg AS (
  SELECT
    t_id,
    tn_name,
    t_season,
    AVG(round_pts_total) AS avg_round_pts
  FROM round_totals
  GROUP BY t_id, tn_name, t_season
)
SELECT
  b.t_id AS `联赛ID`,
  b.tn_name AS `联赛`,
  b.t_season AS `赛季`,
  IFNULL(b.rn_key, '(空)') AS `轮次`,
  b.match_id AS `比赛ID`,
  b.round_number AS `轮次原文`,
  b.final_score AS `比分`,
  b.home_goals AS `主队进球`,
  b.away_goals AS `客队进球`,
  CASE WHEN b.home_goals = b.away_goals THEN '平' ELSE '分胜负' END AS `赛果类型`,
  CASE WHEN b.home_goals = b.away_goals THEN 2 ELSE 3 END AS `本场产出总积分`,
  ROUND(a.avg_round_pts, 4) AS `轮次积分（平均）`
FROM base b
INNER JOIN season_round_pts_avg a
  ON a.t_id = b.t_id
  AND a.tn_name = b.tn_name
  AND a.t_season = b.t_season
ORDER BY b.tn_name, b.t_season,
  CASE
    WHEN b.rn_key IS NULL THEN 1
    ELSE 0
  END,
  CASE
    WHEN b.rn_key REGEXP '^[0-9]+$' THEN CAST(b.rn_key AS UNSIGNED)
    ELSE 999999
  END,
  b.rn_key,
  b.match_id;
