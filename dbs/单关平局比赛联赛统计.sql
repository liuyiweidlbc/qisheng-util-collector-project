-- 单关平局比赛的联赛统计查询
-- 基于 t_match_ext 和 t_match 表结构
-- 关联查询单关比赛中的平局统计

-- 设置字符集和排序规则
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ===========================================
-- 1. 按联赛统计单关平局比赛（汇总）
-- ===========================================
-- 统计每个联赛的单关平局数量、单关总场次、平局率
SELECT 
    COALESCE(ext.league_name, t.tn_name) AS league_name,
    COUNT(DISTINCT CASE 
        WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
            AND COALESCE(t.final_score, ext.final_score) != '' 
            AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
            AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
        THEN ext.match_id 
    END) AS single_draw_count,  -- 单关平局场次
    COUNT(DISTINCT ext.match_id) AS single_total_count,  -- 单关总场次
    ROUND(
        COUNT(DISTINCT CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN ext.match_id 
        END) * 100.0 / 
        NULLIF(COUNT(DISTINCT ext.match_id), 0), 
        2
    ) AS single_draw_ratio,  -- 单关平局率（百分比）
    ROW_NUMBER() OVER (
        ORDER BY 
            COUNT(DISTINCT CASE 
                WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                    AND COALESCE(t.final_score, ext.final_score) != '' 
                    AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                    AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
                THEN ext.match_id 
            END) DESC,
            ROUND(
                COUNT(DISTINCT CASE 
                    WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                        AND COALESCE(t.final_score, ext.final_score) != '' 
                        AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                        AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
                    THEN ext.match_id 
                END) * 100.0 / 
                NULLIF(COUNT(DISTINCT ext.match_id), 0), 
                2
            ) DESC
    ) AS ranking  -- 按平局数量和平局率排名
FROM t_match_ext ext
LEFT JOIN t_match t ON ext.match_id = t.match_id
WHERE ext.bet_single_flag != '0'  -- 单关比赛
    AND ext.bet_single_flag IS NOT NULL
    AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL  -- 确保有联赛名称
GROUP BY COALESCE(ext.league_name, t.tn_name)
HAVING COUNT(DISTINCT ext.match_id) > 0  -- 至少有一场单关比赛
ORDER BY 
    single_draw_count DESC,
    single_draw_ratio DESC;


-- ===========================================
-- 2. 单关平局比赛详细列表
-- ===========================================
-- 查询所有单关平局比赛的详细信息
SET @query_league = NULL;  -- 可以修改为具体联赛，如 '英格兰超级联赛'

SELECT 
    COALESCE(ext.league_name, t.tn_name, '未知') AS league_name,
    ext.match_date AS match_date,
    ext.match_time AS match_time,
    ext.match_id AS match_id,
    ext.cnjc_match_id AS cnjc_match_id,
    ext.home_name AS home_team,
    ext.away_name AS away_team,
    ext.final_score AS final_score,
    ext.bet_single_type AS bet_single_type,
    t.round_number AS round_number,
    t.kickoff_time AS kickoff_time
FROM t_match_ext ext
LEFT JOIN t_match t ON ext.match_id = t.match_id
WHERE ext.bet_single_flag != '0'  -- 单关比赛
    AND ext.bet_single_flag IS NOT NULL
    AND COALESCE(t.final_score, ext.final_score) IS NOT NULL 
    AND COALESCE(t.final_score, ext.final_score) != ''
    AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1)  -- 平局判断
    AND (@query_league IS NULL OR COALESCE(ext.league_name, t.tn_name) = @query_league COLLATE utf8mb4_general_ci)
ORDER BY 
    COALESCE(ext.league_name, t.tn_name) ASC,
    ext.match_date DESC,
    ext.match_time DESC,
    ext.match_id ASC;


-- ===========================================
-- 3. 按联赛统计单关平局比赛（不分赛季）
-- ===========================================
-- 汇总所有赛季的单关平局统计
SELECT 
    COALESCE(ext.league_name, t.tn_name) AS league_name,
    COUNT(DISTINCT CASE 
        WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
            AND COALESCE(t.final_score, ext.final_score) != '' 
            AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
            AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
        THEN ext.match_id 
    END) AS single_draw_count,  -- 单关平局场次
    COUNT(DISTINCT ext.match_id) AS single_total_count,  -- 单关总场次
    ROUND(
        COUNT(DISTINCT CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN ext.match_id 
        END) * 100.0 / 
        NULLIF(COUNT(DISTINCT ext.match_id), 0), 
        2
    ) AS single_draw_ratio,  -- 单关平局率（百分比）
    COUNT(DISTINCT t.t_season) AS season_count,  -- 涉及的赛季数
    GROUP_CONCAT(DISTINCT t.t_season ORDER BY t.t_season SEPARATOR ', ') AS seasons  -- 赛季列表
FROM t_match_ext ext
LEFT JOIN t_match t ON ext.match_id = t.match_id
WHERE ext.bet_single_flag != '0'  -- 单关比赛
    AND ext.bet_single_flag IS NOT NULL
    AND ext.final_score IS NOT NULL 
    AND ext.final_score != ''
GROUP BY COALESCE(ext.league_name, t.tn_name)
HAVING COUNT(DISTINCT ext.match_id) > 0  -- 至少有一场单关比赛
ORDER BY 
    single_draw_count DESC,
    single_draw_ratio DESC,
    league_name ASC;


-- ===========================================
-- 4. 按单关类型统计平局（HAD/HHAD等）
-- ===========================================
-- 按 bet_single_type 分组统计单关平局
SELECT 
    COALESCE(ext.league_name, t.tn_name) AS league_name,
    ext.bet_single_type AS bet_single_type,
    COUNT(DISTINCT CASE 
        WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
            AND COALESCE(t.final_score, ext.final_score) != '' 
            AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
            AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
        THEN ext.match_id 
    END) AS single_draw_count,  -- 单关平局场次
    COUNT(DISTINCT ext.match_id) AS single_total_count,  -- 单关总场次
    ROUND(
        COUNT(DISTINCT CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN ext.match_id 
        END) * 100.0 / 
        NULLIF(COUNT(DISTINCT ext.match_id), 0), 
        2
    ) AS single_draw_ratio  -- 单关平局率（百分比）
FROM t_match_ext ext
LEFT JOIN t_match t ON ext.match_id = t.match_id
WHERE ext.bet_single_flag != '0'  -- 单关比赛
    AND ext.bet_single_flag IS NOT NULL
    AND ext.bet_single_type IS NOT NULL
GROUP BY 
    COALESCE(ext.league_name, t.tn_name),
    ext.bet_single_type
HAVING COUNT(DISTINCT ext.match_id) > 0
ORDER BY 
    league_name ASC,
    bet_single_type ASC,
    single_draw_count DESC,
    single_draw_ratio DESC;


-- ===========================================
-- 使用说明
-- ===========================================
-- 1. 查询特定联赛的平局详情：修改第46行的变量
--    SET @query_league = '英格兰超级联赛';
--    查询所有联赛：SET @query_league = NULL;
--
-- 2. 单关判断条件：
--    - bet_single_flag != '0' 且 IS NOT NULL
--    - 平局判断：final_score 格式为 'X-Y' 且 X = Y
--
-- 3. 字段说明：
--    - league_name: 联赛名称（优先使用 t_match_ext.league_name，其次 t_match.tn_name）
--    - single_draw_count: 单关平局场次
--    - single_total_count: 单关总场次
--    - single_draw_ratio: 单关平局率（百分比，保留2位小数）
--    - ranking: 排名（按平局数量和平局率从高到低，先按平局数量，再按平局率）
--    - bet_single_type: 单关类型（HAD、HHAD等）
--    - season_count: 涉及的赛季数（查询3）
--    - seasons: 赛季列表（查询3）
--
-- 4. 表关联说明：
--    - 通过 match_id 关联 t_match_ext 和 t_match 表
--    - 使用 LEFT JOIN，确保即使 t_match 表中没有数据也能查询
--
-- 5. 查询说明：
--    - 查询1：按联赛统计单关平局比赛（汇总所有赛季）
--    - 查询2：单关平局比赛详细列表
--    - 查询3：按联赛统计单关平局比赛（包含赛季信息，但不按赛季分组）
--    - 查询4：按单关类型统计平局（HAD/HHAD等）

-- ===========================================
-- 调试查询：检查单关比赛的比分数据
-- ===========================================
-- 用于检查单关比赛的比分格式和判断条件
/*
SELECT 
    ext.match_id,
    ext.bet_single_flag,
    ext.bet_single_type,
    ext.league_name,
    ext.final_score AS ext_final_score,
    t.final_score AS t_final_score,
    COALESCE(t.final_score, ext.final_score) AS used_score,
    CASE 
        WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
            AND COALESCE(t.final_score, ext.final_score) != '' 
            AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
            AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
        THEN '平局'
        ELSE '非平局'
    END AS is_draw
FROM t_match_ext ext
LEFT JOIN t_match t ON ext.match_id = t.match_id
WHERE ext.bet_single_flag != '0'
    AND ext.bet_single_flag IS NOT NULL
    AND COALESCE(t.final_score, ext.final_score) IS NOT NULL
    AND COALESCE(t.final_score, ext.final_score) != ''
LIMIT 100;
*/

