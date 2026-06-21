-- ============================================
-- 笔记表结构定义（最新版本）
-- 创建时间：2024
-- 版本说明：包含标签字段（tags）
-- ============================================

-- 删除已存在的表（如果存在）
DROP TABLE IF EXISTS `t_note_match_relation`;
DROP TABLE IF EXISTS `t_match_note`;

-- ============================================
-- 笔记表：记录不同类型（联赛、球队、主任操盘）的笔记
-- ============================================
CREATE TABLE `t_match_note` (
	`note_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '笔记ID',
	`note_type` VARCHAR(50) NOT NULL COMMENT '笔记类型：LEAGUE-联赛，TEAM-球队，BOOKMAKER-主任操盘' COLLATE 'utf8mb4_general_ci',
	`content` TEXT NULL COMMENT '笔记内容' COLLATE 'utf8mb4_general_ci',
	`league_id` VARCHAR(20) NULL DEFAULT NULL COMMENT '联赛ID（冗余字段，当note_type=LEAGUE时使用）' COLLATE 'utf8mb4_general_ci',
	`league_name` VARCHAR(200) NULL DEFAULT NULL COMMENT '联赛名称（冗余字段，当note_type=LEAGUE时使用）' COLLATE 'utf8mb4_general_ci',
	`team_id` VARCHAR(20) NULL DEFAULT NULL COMMENT '球队ID（冗余字段，当note_type=TEAM时使用，可为home_id或away_id）' COLLATE 'utf8mb4_general_ci',
	`team_name` VARCHAR(200) NULL DEFAULT NULL COMMENT '球队名称（冗余字段，当note_type=TEAM时使用）' COLLATE 'utf8mb4_general_ci',
	`tags` TEXT NULL COMMENT '标签，多个标签用逗号分隔' COLLATE 'utf8mb4_general_ci',
	`created_by` VARCHAR(100) NULL DEFAULT NULL COMMENT '创建人' COLLATE 'utf8mb4_general_ci',
	`created_time` DATETIME NOT NULL DEFAULT (now()) COMMENT '创建时间',
	`updated_time` DATETIME NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
	PRIMARY KEY (`note_id`) USING BTREE,
	INDEX `idx_note_type` (`note_type`) USING BTREE,
	INDEX `idx_league_id` (`league_id`) USING BTREE,
	INDEX `idx_team_id` (`team_id`) USING BTREE,
	INDEX `idx_created_time` (`created_time`) USING BTREE,
	INDEX `idx_type_created` (`note_type`, `created_time`) USING BTREE
)
COMMENT='笔记表：记录联赛、球队、主任操盘等不同类型的笔记'
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;


-- ============================================
-- 笔记与比赛关联表：实现笔记与比赛的多对多关系（一个笔记可以关联多场比赛）
-- ============================================
CREATE TABLE `t_note_match_relation` (
	`relation_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '关联ID',
	`note_id` BIGINT NOT NULL COMMENT '笔记ID，关联t_match_note.note_id',
	`match_id` VARCHAR(20) NOT NULL COMMENT '比赛ID，关联t_match.match_id' COLLATE 'utf8mb4_general_ci',
	`created_time` DATETIME NOT NULL DEFAULT (now()) COMMENT '创建时间',
	PRIMARY KEY (`relation_id`) USING BTREE,
	UNIQUE INDEX `uk_note_match` (`note_id`, `match_id`) USING BTREE
)
COMMENT='笔记与比赛关联表：实现笔记与比赛的多对多关系'
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;

-- ============================================
-- 可选索引：表创建完成后再单独执行（避免创建表时过慢）
-- ============================================

-- 为 t_match_note 表的 tags 字段添加索引（如果需要按标签查询）
-- ALTER TABLE `t_match_note` ADD INDEX `idx_tags` (`tags`(255)) USING BTREE;

-- 为 t_note_match_relation 表添加其他索引（如果需要）
-- ALTER TABLE `t_note_match_relation` ADD INDEX `idx_note_id` (`note_id`) USING BTREE;
-- ALTER TABLE `t_note_match_relation` ADD INDEX `idx_match_id` (`match_id`) USING BTREE;
-- ALTER TABLE `t_note_match_relation` ADD INDEX `idx_match_created` (`match_id`, `created_time`) USING BTREE;

-- 如果需要降序排序索引，可以后续添加（注意：某些MySQL版本创建DESC索引可能较慢）
-- ALTER TABLE `t_match_note` DROP INDEX `idx_created_time`;
-- ALTER TABLE `t_match_note` ADD INDEX `idx_created_time` (`created_time` DESC) USING BTREE;
-- ALTER TABLE `t_match_note` DROP INDEX `idx_type_created`;
-- ALTER TABLE `t_match_note` ADD INDEX `idx_type_created` (`note_type`, `created_time` DESC) USING BTREE;

