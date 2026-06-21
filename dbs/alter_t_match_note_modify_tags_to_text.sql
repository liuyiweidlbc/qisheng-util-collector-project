-- 如果 tags 字段已经是 VARCHAR(500)，需要修改为 TEXT 类型
-- 修改 tags 字段类型为 TEXT（支持更长的标签内容）

ALTER TABLE `t_match_note` 
MODIFY COLUMN `tags` TEXT NULL COMMENT '标签，多个标签用逗号分隔' COLLATE 'utf8mb4_general_ci';

-- 删除旧的索引（如果存在）
ALTER TABLE `t_match_note` 
DROP INDEX `idx_tags`;

-- 重新创建前缀索引（TEXT类型需要使用前缀索引）
ALTER TABLE `t_match_note` 
ADD INDEX `idx_tags` (`tags`(255)) USING BTREE;

