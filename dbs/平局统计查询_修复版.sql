-- 足球比赛平局统计查询 (修复字符集问题)
-- 基于 t_match 表结构

-- 设置字符集和排序规则
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- 1. 根据赛季，统计联赛平局最多的联赛、数量、排名
-- 使用参数化查询，可以通过修改 @target_season 来指定特定赛季
SET @target_season = '2024-25';  -- 可以修改为具体赛季，如 '2022-23', '2023-24' 等，或设为 NULL 查询所有赛季

SELECT 
    t_season AS season,
    tn_name AS league_name,
    COUNT(*) AS draw_count,
    ROW_NUMBER() OVER (PARTITION BY t_season ORDER BY COUNT(*) DESC) AS ranking
FROM t_match 
WHERE final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)  -- 平局判断
    AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
GROUP BY t_season, tn_name
ORDER BY t_season, draw_count DESC;

-- 2. 根据赛季，统计球队平局最多的联赛、数量
SELECT 
    t_season AS season,
    tn_name AS league_name,
    team_name AS team_name,
    COUNT(*) AS draw_count
FROM (
    SELECT 
        t_season,
        tn_name,
        home_name AS team_name,
        final_score
    FROM t_match 
    WHERE final_score IS NOT NULL 
        AND final_score != ''
        AND final_score LIKE '%-%'
        AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)
        AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
    
    UNION ALL
    
    SELECT 
        t_season,
        tn_name,
        away_name AS team_name,
        final_score
    FROM t_match 
    WHERE final_score IS NOT NULL 
        AND final_score != ''
        AND final_score LIKE '%-%'
        AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)
        AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
) AS team_draws
GROUP BY t_season, tn_name, team_name
ORDER BY t_season, draw_count DESC;

-- 3. 统计每一周（周五~周一），联赛、轮次、平局数量
SELECT 
    DATE_FORMAT(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), '%Y-%u') AS year_week,
    WEEK(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s')) AS week_number,
    tn_name AS league_name,
    round_number AS round_number,
    COUNT(*) AS draw_count
FROM t_match 
WHERE final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'
    AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)
    AND kickoff_time IS NOT NULL
    AND kickoff_time != ''
    AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
    -- 筛选周五到周一的比赛 (MySQL中1=周日, 2=周一, ..., 6=周五, 7=周六)
    AND WEEKDAY(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s')) IN (4, 5, 6, 0)  -- 周五(4), 周六(5), 周日(6), 周一(0)
GROUP BY 
    DATE_FORMAT(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s'), '%Y-%u'),
    WEEK(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s')),
    tn_name, 
    round_number
ORDER BY year_week, week_number, draw_count DESC;

-- ===========================================
-- 使用说明：
-- ===========================================
-- 1. 查询特定赛季：修改第9行的 @target_season 变量
--    例如：SET @target_season = '2024-25';
--    例如：SET @target_season = '2023-24';
--
-- 2. 查询所有赛季：将 @target_season 设置为 NULL
--    例如：SET @target_season = NULL;
--
-- 3. 常用赛季格式示例：
--    - 英超：'2024-25', '2023-24'
--    - 西甲：'2024-25', '2023-24'  
--    - 德甲：'2024-25', '2023-24'
--    - 意甲：'2024-25', '2023-24'
--    - 法甲：'2024-25', '2023-24'
--
-- 4. 执行步骤：
--    a) 先执行 SET @target_season = '目标赛季';
--    b) 再执行对应的查询语句
--
-- 5. 批量查询多个赛季：
--    可以分别设置不同的 @target_season 值，多次执行查询
--
-- 6. 字符集问题修复：
--    - 添加了 SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;
--    - 在比较条件中添加了 COLLATE utf8mb4_general_ci
--    - 使用英文字段别名避免中文字符集问题
