-- 单关平局球队统计查询
-- 基于 t_match_ext 和 t_match 表结构
-- 统计每支球队在单关比赛中的平局情况

-- 设置字符集和排序规则
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ===========================================
-- 1. 按联赛统计球队单关平局（汇总）
-- ===========================================
-- 统计每个联赛中每支球队的单关平局数量、总场次、平局率（不区分主客场）
SELECT 
    team_data.league_name AS league_name,
    team_data.team_id AS team_id,
    MAX(team_data.team_name) AS team_name,
    SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) AS single_draw_count,  -- 单关平局场次
    COUNT(*) AS single_total_count,  -- 单关总场次
    ROUND(
        SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 
        2
    ) AS single_draw_ratio,  -- 单关平局率（百分比）
    ROW_NUMBER() OVER (
        PARTITION BY team_data.league_name
        ORDER BY 
            SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) DESC,
            ROUND(
                SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 
                2
            ) DESC
    ) AS ranking  -- 按平局数量和平局率排名
FROM (
    -- 主队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        t.home_id AS team_id,
        t.home_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
    
    UNION ALL
    
    -- 客队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        t.away_id AS team_id,
        t.away_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
) AS team_data
GROUP BY 
    team_data.league_name,
    team_data.team_id
HAVING COUNT(*) > 0  -- 至少有一场单关比赛
ORDER BY 
    team_data.league_name ASC,
    single_draw_count DESC,
    single_draw_ratio DESC;


-- ===========================================
-- 2. 简化版：按联赛统计球队单关平局（汇总）
-- ===========================================
-- 更简洁的统计方式，直接汇总球队数据
SELECT 
    team_data.league_name AS league_name,
    team_data.team_id AS team_id,
    MAX(team_data.team_name) AS team_name,
    SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) AS single_draw_count,  -- 单关平局场次
    COUNT(*) AS single_total_count,  -- 单关总场次
    ROUND(
        SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 
        2
    ) AS single_draw_ratio,  -- 单关平局率（百分比）
    SUM(CASE WHEN team_data.is_draw = 1 AND team_data.is_home = 1 THEN 1 ELSE 0 END) AS home_draw_count,  -- 主场平局数
    ROUND(
        SUM(CASE WHEN team_data.is_draw = 1 AND team_data.is_home = 1 THEN 1 ELSE 0 END) * 100.0 / 
        NULLIF(SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END), 0), 
        2
    ) AS home_draw_ratio,  -- 主场平局占平局总数比例
    SUM(CASE WHEN team_data.is_draw = 1 AND team_data.is_home = 0 THEN 1 ELSE 0 END) AS away_draw_count,  -- 客场平局数
    ROUND(
        SUM(CASE WHEN team_data.is_draw = 1 AND team_data.is_home = 0 THEN 1 ELSE 0 END) * 100.0 / 
        NULLIF(SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END), 0), 
        2
    ) AS away_draw_ratio,  -- 客场平局占平局总数比例
    ROW_NUMBER() OVER (
        PARTITION BY team_data.league_name
        ORDER BY 
            SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) DESC,
            ROUND(
                SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 
                2
            ) DESC
    ) AS ranking  -- 按平局数量和平局率排名
FROM (
    -- 主队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        t.home_id AS team_id,
        t.home_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw,
        1 AS is_home
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
    
    UNION ALL
    
    -- 客队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        t.away_id AS team_id,
        t.away_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw,
        0 AS is_home
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
) AS team_data
GROUP BY 
    team_data.league_name,
    team_data.team_id
HAVING COUNT(*) > 0  -- 至少有一场单关比赛
ORDER BY 
    team_data.league_name ASC,
    single_draw_count DESC,
    single_draw_ratio DESC;


-- ===========================================
-- 3. 单关平局球队详细列表
-- ===========================================
-- 查询所有单关平局比赛中涉及的球队和比赛信息
SET @query_team = NULL;  -- 可以修改为具体球队，如 '曼联'
SET @query_league = NULL;  -- 可以修改为具体联赛，如 '英格兰超级联赛'

SELECT 
    COALESCE(ext.league_name, t.tn_name, '未知') AS league_name,
    ext.match_date AS match_date,
    ext.match_time AS match_time,
    ext.match_id AS match_id,
    ext.cnjc_match_id AS cnjc_match_id,
    t.home_id AS home_team_id,
    ext.home_name AS home_team,
    t.away_id AS away_team_id,
    ext.away_name AS away_team,
    COALESCE(t.final_score, ext.final_score) AS final_score,
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
    AND (@query_league IS NULL OR COALESCE(ext.league_name, t.tn_name) COLLATE utf8mb4_general_ci = @query_league)
    AND (@query_team IS NULL OR ext.home_name COLLATE utf8mb4_general_ci = @query_team OR ext.away_name COLLATE utf8mb4_general_ci = @query_team)
ORDER BY 
    COALESCE(ext.league_name, t.tn_name) ASC,
    ext.match_date DESC,
    ext.match_time DESC,
    ext.match_id ASC;


-- ===========================================
-- 4. 按单关类型统计球队平局（HAD/HHAD等）
-- ===========================================
-- 按 bet_single_type 分组统计球队单关平局
SELECT 
    team_data.league_name AS league_name,
    team_data.bet_single_type AS bet_single_type,
    team_data.team_id AS team_id,
    MAX(team_data.team_name) AS team_name,
    SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) AS single_draw_count,  -- 单关平局场次
    COUNT(*) AS single_total_count,  -- 单关总场次
    ROUND(
        SUM(CASE WHEN team_data.is_draw = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 
        2
    ) AS single_draw_ratio  -- 单关平局率（百分比）
FROM (
    -- 主队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        ext.bet_single_type,
        t.home_id AS team_id,
        t.home_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND ext.bet_single_type IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
    
    UNION ALL
    
    -- 客队数据
    SELECT 
        COALESCE(ext.league_name, t.tn_name) AS league_name,
        ext.match_id,
        ext.bet_single_type,
        t.away_id AS team_id,
        t.away_name AS team_name,
        CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN 1 
            ELSE 0 
        END AS is_draw
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND ext.bet_single_type IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL
) AS team_data
GROUP BY 
    team_data.league_name,
    team_data.bet_single_type,
    team_data.team_id
HAVING COUNT(*) > 0
ORDER BY 
    team_data.league_name ASC,
    team_data.bet_single_type ASC,
    single_draw_count DESC,
    single_draw_ratio DESC;


-- ===========================================
-- 使用说明
-- ===========================================
-- 1. 查询特定球队的平局详情：修改第148-149行的变量
--    SET @query_team = '曼联';
--    SET @query_league = '英格兰超级联赛';
--    查询所有球队：SET @query_team = NULL;
--
-- 2. 单关判断条件：
--    - bet_single_flag != '0' 且 IS NOT NULL
--    - 平局判断：final_score 格式为 'X-Y' 且 X = Y
--
-- 3. 字段说明：
--    - league_name: 联赛名称（优先使用 t_match_ext.league_name，其次 t_match.tn_name）
--    - team_id: 球队ID
--    - team_name: 球队名称
--    - single_draw_count: 单关平局场次
--    - single_total_count: 单关总场次
--    - single_draw_ratio: 单关平局率（百分比，保留2位小数）
--    - home_draw_count: 主场平局数（仅查询2有）
--    - home_draw_ratio: 主场平局占平局总数比例（百分比，仅查询2有）
--    - away_draw_count: 客场平局数（仅查询2有）
--    - away_draw_ratio: 客场平局占平局总数比例（百分比，仅查询2有）
--    - ranking: 排名（按平局数量和平局率从高到低，先按平局数量，再按平局率）
--    - bet_single_type: 单关类型（HAD、HHAD等）
--
-- 4. 表关联说明：
--    - 通过 match_id 关联 t_match_ext 和 t_match 表
--    - 使用 LEFT JOIN，确保即使 t_match 表中没有数据也能查询
--    - 使用 UNION ALL 合并主队和客队数据
--
-- 5. 查询说明：
--    - 查询1：按联赛统计球队单关平局（不区分主客场，只统计全部平局）
--    - 查询2：按联赛统计球队单关平局（包含主客场详细统计）
--    - 查询3：单关平局球队详细列表
--    - 查询4：按单关类型统计球队平局（HAD/HHAD等）
--
-- 6. 排序说明：
--    - 先按联赛名称排序
--    - 再按平局数量降序
--    - 最后按平局比例降序

