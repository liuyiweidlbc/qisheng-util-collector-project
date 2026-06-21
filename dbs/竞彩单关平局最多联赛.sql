-- 竞彩单关平局最多的联赛统计
-- 根据 t_match_ext 关联 t_match 表的 final_score 统计平局最多的联赛

-- 设置字符集和排序规则
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ===========================================
-- 统计平局最多的联赛（按平局数量排序）
-- ===========================================
SELECT 
    league_id,
    league_name,
    draw_count,
    total_count,
    draw_ratio,
    (
        SELECT JSON_ARRAYAGG(draw_match_id)
        FROM (
            SELECT DISTINCT ext2.match_id AS draw_match_id
            FROM t_match_ext ext2
            LEFT JOIN t_match t2 ON ext2.match_id = t2.match_id
            WHERE ext2.bet_single_flag != '0'
                AND ext2.bet_single_flag IS NOT NULL
                AND ext2.cnjc_flag != '0'
                AND ext2.cnjc_flag IS NOT NULL
                AND COALESCE(ext2.league_name, t2.tn_name) = stats.league_name
                AND COALESCE(t2.t_id, '') = COALESCE(stats.league_id, '')
                AND COALESCE(t2.final_score, ext2.final_score) IS NOT NULL 
                AND COALESCE(t2.final_score, ext2.final_score) != ''
                AND TRIM(COALESCE(t2.final_score, ext2.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t2.final_score, ext2.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t2.final_score, ext2.final_score)), '-', -1)
        ) AS draw_matches
    ) AS draw_match_ids  -- 平局比赛ID列表（JSON格式）
FROM (
    SELECT 
        MAX(t.t_id) AS league_id,  -- 联赛ID
        COALESCE(ext.league_name, t.tn_name) AS league_name,  -- 联赛名称
        COUNT(DISTINCT CASE 
            WHEN COALESCE(t.final_score, ext.final_score) IS NOT NULL 
                AND COALESCE(t.final_score, ext.final_score) != '' 
                AND TRIM(COALESCE(t.final_score, ext.final_score)) LIKE '%-%'
                AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, ext.final_score)), '-', -1) 
            THEN ext.match_id 
        END) AS draw_count,  -- 平局场次
        COUNT(DISTINCT ext.match_id) AS total_count,  -- 总场次
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
        ) AS draw_ratio  -- 平局率（百分比）
    FROM t_match_ext ext
    LEFT JOIN t_match t ON ext.match_id = t.match_id
    WHERE ext.bet_single_flag != '0'  -- 单关比赛
        AND ext.bet_single_flag IS NOT NULL
        AND ext.cnjc_flag != '0'  -- 竞彩足球
        AND ext.cnjc_flag IS NOT NULL
        AND COALESCE(ext.league_name, t.tn_name) IS NOT NULL  -- 确保有联赛名称
    GROUP BY 
        t.t_id,
        COALESCE(ext.league_name, t.tn_name)
    HAVING COUNT(DISTINCT ext.match_id) > 0  -- 至少有一场比赛
) AS stats
ORDER BY 
    draw_count DESC,  -- 按平局数量降序
    draw_ratio DESC,  -- 再按平局率降序
    league_name ASC;  -- 最后按联赛名称升序


-- ===========================================
-- 查询指定联赛的平局比赛（倒序排列）
-- ===========================================
SET @query_league = '英格兰超级联赛';  -- 可以修改为具体联赛名称，如 '英格兰超级联赛'

SELECT 
    tt.league_name AS league_name,
    tt.match_id AS match_id,
    tt.cnjc_match_id AS cnjc_match_id,
    tt.match_date AS match_date,
    tt.match_time AS match_time,
    tt.home_name AS home_name,
    tt.away_name AS away_name,
    COALESCE(t.final_score, tt.final_score) AS final_score,
    tt.bet_single_type AS bet_single_type,
    tt.bet_single_flag AS bet_single_flag,
    tt.cnjc_flag AS cnjc_flag,
    t.t_id AS league_id,
    t.tn_name AS tn_name,
    t.kickoff_time AS kickoff_time,
    t.round_number AS round_number
FROM t_match_ext tt
LEFT JOIN t_match t ON tt.match_id = t.match_id
WHERE tt.league_name = @query_league COLLATE utf8mb4_general_ci
    AND tt.bet_single_flag != '0'  -- 单关比赛（与第一个查询保持一致）
    AND tt.bet_single_flag IS NOT NULL
    AND tt.cnjc_flag != '0'  -- 竞彩足球（与第一个查询保持一致）
    AND tt.cnjc_flag IS NOT NULL
    AND COALESCE(t.final_score, tt.final_score) IS NOT NULL 
    AND COALESCE(t.final_score, tt.final_score) != ''
    AND TRIM(COALESCE(t.final_score, tt.final_score)) LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, tt.final_score)), '-', 1) = SUBSTRING_INDEX(TRIM(COALESCE(t.final_score, tt.final_score)), '-', -1)  -- 平局判断
ORDER BY 
    tt.match_date DESC,  -- 按比赛日期倒序
    tt.match_time DESC,  -- 按比赛时间倒序
    tt.match_id DESC;  -- 按比赛ID倒序

