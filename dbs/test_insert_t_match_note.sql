-- ============================================
-- 笔记表测试数据插入语句（INSERT SELECT）
-- ============================================

-- 1. 插入联赛类型笔记（从 t_match 表选择联赛信息）
INSERT INTO `t_match_note` (
	`note_type`,
	`content`,
	`league_id`,
	`league_name`,
	`tags`,
	`created_by`
)
SELECT DISTINCT
	'LEAGUE' AS `note_type`,
	CONCAT('联赛笔记：', `tn_name`, ' - ', `t_season`, '赛季') AS `content`,
	`t_id` AS `league_id`,
	`tn_name` AS `league_name`,
	CONCAT('联赛,', `tn_name`, ',', `t_season`) AS `tags`,
	'测试用户' AS `created_by`
FROM `t_match`
WHERE `tn_name` IS NOT NULL 
	AND `t_id` IS NOT NULL
	AND `t_season` IS NOT NULL
LIMIT 10;  -- 限制插入10条，避免数据过多


-- 2. 插入球队类型笔记（从 t_match 表选择主队信息）
INSERT INTO `t_match_note` (
	`note_type`,
	`content`,
	`team_id`,
	`team_name`,
	`tags`,
	`created_by`
)
SELECT DISTINCT
	'TEAM' AS `note_type`,
	CONCAT('球队笔记：', `home_name`, ' - 主队分析') AS `content`,
	`home_id` AS `team_id`,
	`home_name` AS `team_name`,
	CONCAT('球队,主队,', `home_name`) AS `tags`,
	'测试用户' AS `created_by`
FROM `t_match`
WHERE `home_id` IS NOT NULL 
	AND `home_name` IS NOT NULL
LIMIT 10;  -- 限制插入10条


-- 3. 插入主任操盘类型笔记（从 t_match 表选择比赛信息）
INSERT INTO `t_match_note` (
	`note_type`,
	`content`,
	`tags`,
	`created_by`
)
SELECT DISTINCT
	'BOOKMAKER' AS `note_type`,
	CONCAT('主任操盘分析：', `home_name`, ' VS ', `away_name`, ' - 赔率变化分析') AS `content`,
	CONCAT('操盘,赔率分析,', `tn_name`) AS `tags`,
	'测试用户' AS `created_by`
FROM `t_match`
WHERE `home_name` IS NOT NULL 
	AND `away_name` IS NOT NULL
	AND `match_id` IS NOT NULL
LIMIT 10;  -- 限制插入10条


-- 4. 插入笔记与比赛的关联数据（一个笔记关联多场比赛）
-- 示例：将联赛类型笔记关联到该联赛的所有比赛
INSERT INTO `t_note_match_relation` (
	`note_id`,
	`match_id`
)
SELECT 
	n.`note_id`,
	m.`match_id`
FROM `t_match_note` n
INNER JOIN `t_match` m ON n.`league_id` = m.`t_id`
WHERE n.`note_type` = 'LEAGUE'
	AND n.`league_id` IS NOT NULL
	AND m.`match_id` IS NOT NULL
LIMIT 50;  -- 限制插入50条关联


-- 5. 插入笔记与比赛的关联数据（主任操盘笔记关联特定比赛）
INSERT INTO `t_note_match_relation` (
	`note_id`,
	`match_id`
)
SELECT 
	n.`note_id`,
	m.`match_id`
FROM `t_match_note` n
INNER JOIN `t_match` m ON (
	n.`content` LIKE CONCAT('%', m.`home_name`, '%')
	AND n.`content` LIKE CONCAT('%', m.`away_name`, '%')
)
WHERE n.`note_type` = 'BOOKMAKER'
	AND m.`match_id` IS NOT NULL
LIMIT 20;  -- 限制插入20条关联


-- ============================================
-- 查询测试：验证插入的数据
-- ============================================

-- 查询所有笔记
-- SELECT * FROM `t_match_note` ORDER BY `created_time` DESC;

-- 查询某个笔记关联的所有比赛
-- SELECT 
-- 	n.*,
-- 	m.`home_name`,
-- 	m.`away_name`,
-- 	m.`kickoff_time`
-- FROM `t_match_note` n
-- INNER JOIN `t_note_match_relation` r ON n.`note_id` = r.`note_id`
-- INNER JOIN `t_match` m ON r.`match_id` = m.`match_id`
-- WHERE n.`note_id` = 1;

-- 查询某场比赛关联的所有笔记
-- SELECT 
-- 	n.*,
-- 	m.`home_name`,
-- 	m.`away_name`
-- FROM `t_match_note` n
-- INNER JOIN `t_note_match_relation` r ON n.`note_id` = r.`note_id`
-- INNER JOIN `t_match` m ON r.`match_id` = m.`match_id`
-- WHERE m.`match_id` = '某个match_id';

-- 按标签查询笔记
-- SELECT * FROM `t_match_note` WHERE `tags` LIKE '%联赛%';

-- 统计各类型笔记数量
-- SELECT `note_type`, COUNT(*) AS `count` FROM `t_match_note` GROUP BY `note_type`;

