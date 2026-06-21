-- ============================================
-- t_match_id_maping_ext  外站比赛 ID 映射扩展
-- 用途：多网站比赛快照 → match_id 关联 t_match 做跨站映射
-- 唯一键：source_site + match_link（同链接 UPSERT 更新比分/预测等）
-- 时间：kickoff=外站展示原文；kickoff_time=统一本地时间（建议北京时间）
-- 环境：MySQL 8.0+（生成列 is_mapped）
-- ============================================

DROP TABLE IF EXISTS `t_match_id_maping_ext`;

CREATE TABLE `t_match_id_maping_ext` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',

	-- ---------- 与 t_match 映射 ----------
	`match_id` VARCHAR(20) NULL DEFAULT NULL COMMENT '中心比赛 ID，对应 t_match.match_id' COLLATE 'utf8mb4_general_ci',
	`is_mapped` TINYINT(1) GENERATED ALWAYS AS (IF(`match_id` IS NULL, 0, 1)) STORED COMMENT '0=待映射 1=已映射',

	-- ---------- 外站身份 ----------
	`source_site` VARCHAR(20) NOT NULL COMMENT 'flashscore | whoscored | forebet | vzhan' COLLATE 'utf8mb4_general_ci',
	`match_link` VARCHAR(512) NOT NULL COMMENT '外站比赛详情 URL' COLLATE 'utf8mb4_general_ci',

	-- ---------- 比赛快照 ----------
	`country` VARCHAR(100) NULL DEFAULT NULL COMMENT '国家/地区' COLLATE 'utf8mb4_general_ci',
	`league` VARCHAR(200) NULL DEFAULT NULL COMMENT '联赛' COLLATE 'utf8mb4_general_ci',
	`kickoff` VARCHAR(50) NULL DEFAULT NULL COMMENT '外站开球原文（各站格式/时区不一，如 19/05/2026 19:00、HT、FT、Live）' COLLATE 'utf8mb4_general_ci',
	`kickoff_time` DATETIME NULL DEFAULT NULL COMMENT '开球本地时间（统一存北京时间，用于排序/映射窗口匹配）',
	`kickoff_tz` VARCHAR(32) NULL DEFAULT NULL COMMENT '上传时源时区（可选，如 +00:00、Europe/London、site-local）' COLLATE 'utf8mb4_general_ci',
	`home_team` VARCHAR(200) NOT NULL COMMENT '主队（外站队名）' COLLATE 'utf8mb4_general_ci',
	`away_team` VARCHAR(200) NOT NULL COMMENT '客队（外站队名）' COLLATE 'utf8mb4_general_ci',
	`score` VARCHAR(20) NULL DEFAULT NULL COMMENT '比分（FS/WS 现场或终场；Forebet 存 FT）' COLLATE 'utf8mb4_general_ci',

	-- ---------- Forebet 扩展 ----------
	`prob_1x2` VARCHAR(32) NULL DEFAULT NULL COMMENT '胜平负概率，如 78/15/7' COLLATE 'utf8mb4_general_ci',
	`pred_1x2` VARCHAR(4) NULL DEFAULT NULL COMMENT '胜平负预测：1 | X | 2' COLLATE 'utf8mb4_general_ci',
	`pred_score` VARCHAR(20) NULL DEFAULT NULL COMMENT '预测比分，如 3-0' COLLATE 'utf8mb4_general_ci',

	-- ---------- 抓取元数据 ----------
	`page_url` VARCHAR(512) NULL DEFAULT NULL COMMENT '列表页 URL' COLLATE 'utf8mb4_general_ci',
	`script_version` VARCHAR(16) NULL DEFAULT NULL COMMENT '油猴脚本版本' COLLATE 'utf8mb4_general_ci',
	`created_time` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP) COMMENT '首次入库',
	`updated_time` DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新',

	PRIMARY KEY (`id`) USING BTREE,

	UNIQUE KEY `uk_source_match_link` (`source_site`, `match_link`(191)) USING BTREE,
	INDEX `idx_match_source` (`match_id`, `source_site`) USING BTREE,
	INDEX `idx_unmap_queue` (`is_mapped`, `source_site`, `updated_time` DESC) USING BTREE,
	INDEX `idx_site_teams` (`source_site`, `league`(64), `home_team`(64), `away_team`(64)) USING BTREE,
	INDEX `idx_site_kickoff_time` (`source_site`, `kickoff_time`) USING BTREE,
	INDEX `idx_kickoff_time` (`kickoff_time`) USING BTREE,
	INDEX `idx_source_updated` (`source_site`, `updated_time` DESC) USING BTREE,
	INDEX `idx_created_time` (`created_time` DESC) USING BTREE

) ENGINE=InnoDB
  ROW_FORMAT=DYNAMIC
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci
  COMMENT='外站比赛映射扩展：kickoff 原文 + kickoff_time 本地时间'
;


-- ============================================
-- 时间字段约定
-- ============================================
-- kickoff       外站页面/接口原样展示，可能含 HT、FT、Live、各站日期格式
-- kickoff_time  入库统一为业务本地时间（默认 Asia/Shanghai，无时区后缀）
-- kickoff_tz    客户端上传的源时区说明，便于审计与重算；映射匹配以 kickoff_time 为准
--
-- 上传示例（接口 JSON）：
--   "kickoff": "19/05/2026 12:00",
--   "kickoff_time": "2026-05-19 20:00:00",
--   "kickoff_tz": "+00:00"
-- 赛中阶段（HT/FT）时 kickoff_time 可 NULL，仅更新 kickoff 文案

-- ============================================
-- UPSERT 示例
-- ============================================
-- INSERT INTO t_match_id_maping_ext (
--   source_site, match_id, country, league, kickoff, kickoff_time, kickoff_tz,
--   home_team, away_team, score, prob_1x2, pred_1x2, pred_score,
--   match_link, page_url, script_version
-- ) VALUES (
--   'forebet', NULL, 'England', 'Premier League', '19/05/2026 12:00', '2026-05-19 20:00:00', '+00:00',
--   'Arsenal', 'Burnley', '2-1', '65/20/15', '1', '3-0',
--   'https://www.forebet.com/en/football/matches/arsenal-burnley-2316104',
--   'https://www.forebet.com/en/football-tips-and-predictions-for-england/premier-league',
--   '1.3.0'
-- )
-- ON DUPLICATE KEY UPDATE
--   match_id       = COALESCE(VALUES(match_id), match_id),
--   country        = VALUES(country),
--   league         = VALUES(league),
--   kickoff        = VALUES(kickoff),
--   kickoff_time   = COALESCE(VALUES(kickoff_time), kickoff_time),
--   kickoff_tz     = COALESCE(VALUES(kickoff_tz), kickoff_tz),
--   home_team      = VALUES(home_team),
--   away_team      = VALUES(away_team),
--   score          = VALUES(score),
--   prob_1x2       = VALUES(prob_1x2),
--   pred_1x2       = VALUES(pred_1x2),
--   pred_score     = VALUES(pred_score),
--   page_url       = VALUES(page_url),
--   script_version = VALUES(script_version),
--   updated_time   = CURRENT_TIMESTAMP;

-- ============================================
-- 映射：按时间窗口拉待匹配（命中 idx_site_kickoff_time）
-- ============================================
-- SELECT id, source_site, league, home_team, away_team, kickoff, kickoff_time, match_link
-- FROM t_match_id_maping_ext
-- WHERE is_mapped = 0
--   AND source_site = 'flashscore'
--   AND kickoff_time BETWEEN '2026-05-19 18:00:00' AND '2026-05-19 23:59:59'
-- ORDER BY kickoff_time;
