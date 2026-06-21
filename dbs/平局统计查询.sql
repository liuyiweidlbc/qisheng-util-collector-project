-- 足球比赛平局统计查询
-- 基于 t_match 表结构

-- 设置字符集和排序规则
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- 设置指定联赛过滤条件
SET @target_leagues = '英格兰超级联赛,德国甲组联赛,意大利甲组联赛,英格兰超级联赛,法国甲组联赛,葡萄牙冠军联赛,荷兰甲组联赛,英格兰冠军联赛,欧洲冠军联赛,欧洲联赛,日本J1联赛,韩国K甲组联赛,德国乙组联赛';

-- 1. 根据赛季，统计联赛平局最多的联赛、数量、排名
-- 使用参数化查询，可以通过修改 @target_season 来指定特定赛季
SET @target_season = '2024-25';  -- 可以修改为具体赛季，如 '2022-23', '2023-24' 等，或设为 NULL 查询所有赛季

SELECT 
    t_season AS season,
    t_id AS league_id,
    tn_name AS league_name,
    COUNT(*) AS draw_count,
    total_matches,
    ROUND(COUNT(*) * 100.0 / total_matches, 2) AS draw_ratio,
    round_count AS round_count,
    ROW_NUMBER() OVER (PARTITION BY t_season ORDER BY ROUND(COUNT(*) * 100.0 / total_matches, 2) DESC) AS ranking
FROM t_match 
CROSS JOIN (
    SELECT t_id AS league_id, tn_name AS league_name, COUNT(*) AS total_matches, COUNT(DISTINCT round_number) AS round_count
    FROM t_match 
    WHERE final_score IS NOT NULL 
        AND final_score != ''
        AND final_score LIKE '%-%'
        AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)
        AND FIND_IN_SET(tn_name, @target_leagues) > 0  -- 联赛过滤
    GROUP BY t_id, tn_name
    HAVING COUNT(*) > 20  -- 过滤比赛场次大于20场的联赛
) AS total_stats
WHERE final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)  -- 平局判断
    AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
    AND t_match.t_id = total_stats.league_id  -- 匹配联赛ID
    AND FIND_IN_SET(t_match.tn_name, @target_leagues) > 0  -- 联赛过滤
GROUP BY t_season, t_id, tn_name, total_matches, round_count
ORDER BY t_season, draw_ratio DESC;


-- 1.2 根据赛季、联赛按轮次汇总平局统计
-- 设置默认查询参数
SET @round_season = '2024-25';  -- 可以修改为具体赛季
SET @round_league = '英格兰超级联赛';  -- 可以修改为具体联赛西班牙甲组

SELECT 
    t_match.t_season AS season,
    t_match.t_id AS league_id,
    t_match.tn_name AS league_name,
    t_match.round_number AS round_number,
    COUNT(*) AS draw_count,
    round_stats.total_matches,
    ROUND(COUNT(*) * 100.0 / round_stats.total_matches, 2) AS draw_ratio,
    ROW_NUMBER() OVER (ORDER BY ROUND(COUNT(*) * 100.0 / round_stats.total_matches, 2) DESC) AS round_ranking
FROM t_match 
CROSS JOIN (
    SELECT round_number AS round_number, COUNT(*) AS total_matches
    FROM t_match 
    WHERE final_score IS NOT NULL 
        AND final_score != ''
        AND final_score LIKE '%-%'
        AND t_season = @round_season COLLATE utf8mb4_general_ci
        AND tn_name = @round_league COLLATE utf8mb4_general_ci
        AND FIND_IN_SET(tn_name, @target_leagues) > 0
    GROUP BY round_number
) AS round_stats
WHERE t_match.final_score IS NOT NULL 
    AND t_match.final_score != ''
    AND t_match.final_score LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(t_match.final_score, '-', 1) = SUBSTRING_INDEX(t_match.final_score, '-', -1)  -- 平局判断
    AND t_match.t_season = @round_season COLLATE utf8mb4_general_ci  -- 赛季过滤
    AND t_match.tn_name = @round_league COLLATE utf8mb4_general_ci  -- 联赛过滤
    AND FIND_IN_SET(t_match.tn_name, @target_leagues) > 0  -- 联赛过滤
    AND t_match.round_number = round_stats.round_number  -- 匹配轮次
GROUP BY t_match.t_season, t_match.t_id, t_match.tn_name, t_match.round_number, round_stats.total_matches
ORDER BY draw_ratio DESC, t_match.round_number ASC;


-- 1.1 根据赛季、联赛查询所有平局的比赛详情
-- 设置默认查询参数
SET @query_season = '2024-25';  -- 可以修改为具体赛季
SET @query_league = '英格兰超级联赛';  -- 可以修改为具体联赛

SELECT 
    t_season AS season,
    t_id AS league_id,
    tn_name AS league_name,
    round_number AS round_number,
    kickoff_time AS kickoff_time,
    match_id AS match_id,
    home_id AS home_team_id,
    home_name AS home_team,
    away_id AS away_team_id,
    away_name AS away_team,
    final_score AS final_score
FROM t_match 
WHERE final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'  -- 确保有比分格式
    AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)  -- 平局判断
    AND t_season = @query_season COLLATE utf8mb4_general_ci  -- 赛季过滤
    AND tn_name = @query_league COLLATE utf8mb4_general_ci  -- 联赛过滤
    AND FIND_IN_SET(tn_name, @target_leagues) > 0  -- 联赛过滤
ORDER BY round_number ASC, kickoff_time ASC, match_id ASC;

-- 2. 汇总球队平局次数、平局率、球队的比赛总场数
-- 设置默认联赛过滤条件
SET @team_league = '英格兰超级联赛';  -- 可以修改为具体联赛

SELECT 
    team_stats.t_season AS season,
    team_stats.t_id AS league_id,
    team_stats.tn_name AS league_name,
    team_stats.team_id AS team_id,
    team_stats.team_name AS team_name,
    team_stats.draw_count AS draw_count,
    team_stats.total_matches AS total_matches,
    ROUND(team_stats.draw_count * 100.0 / team_stats.total_matches, 2) AS draw_ratio,
    team_stats.home_draws AS home_draws,
    ROUND(team_stats.home_draws * 100.0 / team_stats.draw_count, 2) AS home_draw_ratio,
    team_stats.away_draws AS away_draws,
    ROUND(team_stats.away_draws * 100.0 / team_stats.draw_count, 2) AS away_draw_ratio
FROM (
    SELECT 
        t_season,
        t_id,
        tn_name,
        team_id,
        MAX(team_name) AS team_name,  -- 取最新的球队名称
        SUM(CASE WHEN is_draw = 1 THEN 1 ELSE 0 END) AS draw_count,
        SUM(CASE WHEN is_draw = 1 AND is_home = 1 THEN 1 ELSE 0 END) AS home_draws,
        SUM(CASE WHEN is_draw = 1 AND is_home = 0 THEN 1 ELSE 0 END) AS away_draws,
        COUNT(*) AS total_matches
    FROM (
        SELECT 
            t_season,
            t_id,
            tn_name,
            home_id AS team_id,
            home_name AS team_name,
            CASE WHEN SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1) THEN 1 ELSE 0 END AS is_draw,
            1 AS is_home
        FROM t_match 
        WHERE final_score IS NOT NULL 
            AND final_score != ''
            AND final_score LIKE '%-%'
            AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)
            AND FIND_IN_SET(tn_name, @target_leagues) > 0
            AND tn_name = @team_league COLLATE utf8mb4_general_ci  -- 联赛过滤
        
        UNION ALL
        
        SELECT 
            t_season,
            t_id,
            tn_name,
            away_id AS team_id,
            away_name AS team_name,
            CASE WHEN SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1) THEN 1 ELSE 0 END AS is_draw,
            0 AS is_home
        FROM t_match 
        WHERE final_score IS NOT NULL 
            AND final_score != ''
            AND final_score LIKE '%-%'
            AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)
            AND FIND_IN_SET(tn_name, @target_leagues) > 0
            AND tn_name = @team_league COLLATE utf8mb4_general_ci  -- 联赛过滤
    ) AS all_team_matches
    GROUP BY t_season, t_id, tn_name, team_id  -- 按team_id去重
) AS team_stats
ORDER BY team_stats.t_season, draw_ratio DESC, team_stats.team_name ASC;

-- 5. 根据球队ID、联赛ID，按轮次显示该球队的比赛结果：： TODO 胜率、不败率、平局率， 平局主客场次数、比例
-- 设置查询参数
SET @query_team_id = 240244;  -- 可以修改为具体球队ID3243
SET @query_league_id = 169;  -- 可以修改为具体联赛ID
SET @query_team_season = '2024-25';  -- 可以修改为具体赛季

SELECT 
    t_season AS season,
    t_id AS league_id,
    tn_name AS league_name,
    round_number AS round,
    match_id,
    kickoff_time,
    home_id,
    home_name,
    away_id,
    away_name,
    final_score,
    CASE 
        WHEN SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1) THEN '平局'
        WHEN (home_id = @query_team_id AND SUBSTRING_INDEX(final_score, '-', 1) > SUBSTRING_INDEX(final_score, '-', -1)) 
          OR (away_id = @query_team_id AND SUBSTRING_INDEX(final_score, '-', 1) < SUBSTRING_INDEX(final_score, '-', -1)) THEN '胜利'
        ELSE '失败'
    END AS result,
    CASE 
        WHEN home_id = @query_team_id THEN '主场'
        ELSE '客场'
    END AS home_away
FROM t_match 
WHERE final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'
    AND (home_id = @query_team_id OR away_id = @query_team_id)
    AND t_id = @query_league_id
    AND t_season = @query_team_season COLLATE utf8mb4_general_ci
ORDER BY round_number ASC, kickoff_time ASC, match_id ASC;


-- 3. 根据赛季，统计球队平局最多的联赛、数量
SELECT 
    team_draws.t_season AS season,
    team_draws.t_id AS league_id,
    team_draws.tn_name AS league_name,
    team_draws.team_id AS team_id,
    team_draws.team_name AS team_name,
    COUNT(*) AS draw_count,
    total_stats.total_matches,
    ROUND(COUNT(*) * 100.0 / total_stats.total_matches, 2) AS draw_ratio
FROM (
    SELECT 
        t_season,
        t_id,
        tn_name,
        team_id,
        MAX(team_name) AS team_name,  -- 取最新的球队名称
        final_score
    FROM (
        SELECT 
            t_season,
            t_id,
            tn_name,
            home_id AS team_id,
            home_name AS team_name,
            final_score
        FROM t_match 
        WHERE final_score IS NOT NULL 
            AND final_score != ''
            AND final_score LIKE '%-%'
            AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)
            AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
            AND FIND_IN_SET(tn_name, @target_leagues) > 0  -- 联赛过滤
        
        UNION ALL
        
        SELECT 
            t_season,
            t_id,
            tn_name,
            away_id AS team_id,
            away_name AS team_name,
            final_score
        FROM t_match 
        WHERE final_score IS NOT NULL 
            AND final_score != ''
            AND final_score LIKE '%-%'
            AND SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)
            AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)  -- 赛季过滤，添加COLLATE
            AND FIND_IN_SET(tn_name, @target_leagues) > 0  -- 联赛过滤
    ) AS all_team_draws
    GROUP BY t_season, t_id, tn_name, team_id, final_score  -- 按team_id去重
) AS team_draws
CROSS JOIN (
    SELECT t_id AS league_id, tn_name AS league_name, COUNT(*) AS total_matches
    FROM t_match 
    WHERE final_score IS NOT NULL 
        AND final_score != ''
        AND final_score LIKE '%-%'
        AND (@target_season IS NULL OR t_season = @target_season COLLATE utf8mb4_general_ci)
        AND FIND_IN_SET(tn_name, @target_leagues) > 0  -- 联赛过滤
    GROUP BY t_id, tn_name
) AS total_stats
WHERE team_draws.t_id = total_stats.league_id  -- 匹配联赛ID
GROUP BY team_draws.t_season, team_draws.t_id, team_draws.tn_name, team_draws.team_id, team_draws.team_name, total_stats.total_matches
ORDER BY team_draws.t_season, draw_ratio DESC;


-- 补充查询：更精确的平局判断（考虑加时赛和点球大战）
-- 如果您的数据中包含加时赛比分，可以使用以下查询：
/*
SELECT 
    t_season AS 赛季,
    tn_name AS 联赛名称,
    COUNT(*) AS 平局数量,
    ROW_NUMBER() OVER (PARTITION BY t_season ORDER BY COUNT(*) DESC) AS 排名
FROM t_match 
WHERE status = 'FT' 
    AND final_score IS NOT NULL 
    AND final_score != ''
    AND final_score LIKE '%-%'
    -- 更精确的平局判断：90分钟内平局
    AND (
        SUBSTRING_INDEX(final_score, '-', 1) = SUBSTRING_INDEX(final_score, '-', -1)  -- 常规时间平局
        OR 
        (final_score LIKE '%(%' AND SUBSTRING_INDEX(SUBSTRING_INDEX(final_score, '(', 1), '-', 1) = SUBSTRING_INDEX(SUBSTRING_INDEX(final_score, '(', 1), '-', -1))  -- 加时赛平局
    )
GROUP BY t_season, tn_name
ORDER BY t_season, 平局数量 DESC;
*/

-- ===========================================
-- 使用说明：
-- ===========================================
-- 1. 查询特定赛季：修改第9行的 @target_season 变量
--    例如：SET @target_season = '2024-25';
--    例如：SET @target_season = '2024-25';
--
-- 2. 查询所有赛季：将 @target_season 设置为 NULL
--    例如：SET @target_season = NULL;
--
-- 3. 常用赛季格式示例：
--    - 英超：'2024-25', '2024-25'
--    - 西甲：'2024-25', '2024-25'  
--    - 德甲：'2024-25', '2024-25'
--    - 意甲：'2024-25', '2024-25'
--    - 法甲：'2024-25', '2024-25'
--
-- 4. 执行步骤：
--    a) 先执行 SET @target_season = '目标赛季';
--    b) 再执行对应的查询语句
--
-- 5. 批量查询多个赛季：
--    可以分别设置不同的 @target_season 值，多次执行查询
--
-- 6. 新增字段说明：
--    - league_id: 联赛ID
--    - league_name: 联赛名称
--    - team_id: 球队ID
--    - team_name: 球队名称
--    - draw_count: 平局场次数量
--    - total_matches: 总场次数量
--    - draw_ratio: 平局比例（百分比，保留2位小数）
--    - home_draws: 主场平局数（仅第2个查询有）
--    - home_draw_ratio: 主场平局占平局总数比例（百分比，保留2位小数，仅第2个查询有）
--    - away_draws: 客场平局数（仅第2个查询有）
--    - away_draw_ratio: 客场平局占平局总数比例（百分比，保留2位小数，仅第2个查询有）
--    - round_count: 轮次数量（仅第1个查询有）
--    - ranking: 排名（按平局率从高到低排序，仅第1个查询有）
--
-- 7. 过滤条件：
--    - 第1个查询：只显示比赛场次大于20场的联赛
--    - 第2、3个查询：无场次限制
--
-- 8. 第二个查询特殊说明：
--    - 汇总球队平局次数、平局率、球队的比赛总场数
--    - 总场次按球队实际参赛场次计算（主队+客队）
--    - 新增主场平局数、主场平局占平局总数比例
--    - 新增客场平局数、客场平局占平局总数比例
--    - 排序：赛季 > 平局率（降序）> 球队名称（升序）
--    - 包含所有球队的完整统计信息
--    - 默认联赛：英格兰超级联赛（可修改第113行的 @team_league 变量）
--
-- 9. 联赛过滤说明：
--    - 只查询指定的13个联赛
--    - 如需修改联赛列表，请修改第8行的 @target_leagues 变量
--    - 当前包含：英格兰超级联赛、德国甲组联赛、意大利甲组联赛、英格兰超级联赛、法国甲组联赛、葡萄牙冠军联赛、荷兰甲组联赛、英格兰冠军联赛、欧洲冠军联赛、欧洲联赛、日本J1联赛、韩国K甲组联赛、德国乙组联赛
--
-- 10. 新增查询说明（1.1）：
--    - 查询指定赛季和联赛的所有平局比赛详情
--    - 默认参数：2024-25赛季，英格兰超级联赛
--    - 修改参数：第46-47行的 @query_season 和 @query_league 变量
--    - 排序：轮次 > 开赛时间 > 比赛ID（升序）
--    - 返回字段：赛季、联赛、轮次、开赛时间、比赛ID、主队、客队、比分
--
-- 11. 新增查询说明（1.2）：
--    - 按轮次汇总平局统计（平局次数、轮次总场数、平局率、轮次排名）
--    - 默认参数：2024-25赛季，英格兰超级联赛
--    - 修改参数：第70-71行的 @round_season 和 @round_league 变量
--    - 排序：平局率（降序）> 轮次（升序）
--    - 返回字段：赛季、联赛、轮次、平局次数、轮次总场数、平局率、轮次排名
