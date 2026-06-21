-- 为已存在的 t_match_note 表添加标签字段
-- 在 team_name 字段之后添加 tags 字段（TEXT类型，支持更长的标签内容）

ALTER TABLE `t_match_note` 
ADD COLUMN `tags` TEXT NULL COMMENT '标签，多个标签用逗号分隔' COLLATE 'utf8mb4_general_ci' 
AFTER `team_name`;

-- 为 tags 字段添加前缀索引（TEXT类型需要使用前缀索引）
ALTER TABLE `t_match_note` 
ADD INDEX `idx_tags` (`tags`(255)) USING BTREE;

