-- t_match：home_name_en / away_name_en 「非英文」筛查与清空
-- 判定规则：字段非空，且存在至少一个不在「拉丁字母、数字、常见队名符号」集合内的字符（含中文、全角符号、重音字母等会被命中）
-- kickoff_time 为 VARCHAR，若存的是 'YYYY-MM-DD HH:MM:SS' 或 'YYYY-MM-DD' 前缀，可直接用字符串比较；否则请改用 STR_TO_DATE 见文末说明

-- ---------------------------------------------------------------------------
-- 1) 查询：home_name_en 或 away_name_en 「不是上述英文规则」的行
-- ---------------------------------------------------------------------------
SELECT
	match_id,
	kickoff_time,
	home_name,
	home_name_en,
	away_name,
	away_name_en,
	CASE
		WHEN home_name_en IS NOT NULL AND CHAR_LENGTH(home_name_en) > 0
			AND (home_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$' THEN 1
		ELSE 0
	END AS home_en_suspect,
	CASE
		WHEN away_name_en IS NOT NULL AND CHAR_LENGTH(away_name_en) > 0
			AND (away_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$' THEN 1
		ELSE 0
	END AS away_en_suspect
FROM t_match
WHERE
	(
		(home_name_en IS NOT NULL AND CHAR_LENGTH(home_name_en) > 0
			AND (home_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$')
		OR
		(away_name_en IS NOT NULL AND CHAR_LENGTH(away_name_en) > 0
			AND (away_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$')
	)
ORDER BY kickoff_time DESC, match_id;

-- ---------------------------------------------------------------------------
-- 2) 更新：将「非英文规则」的 en 字段置空；并限制开赛时间日期范围（请改日期后再执行）
-- ---------------------------------------------------------------------------
-- 建议先 BEGIN; 执行后 SELECT 核对行数再 COMMIT; 或 ROLLBACK;

-- 用户变量默认 collation 常与表字段不一致，直接与 kickoff_time 比较会触发 1267（Illegal mix of collations）
SET @kickoff_from := CAST('2025-01-01 00:00:00' AS CHAR(19) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci;
SET @kickoff_to   := CAST('2025-12-31 23:59:59' AS CHAR(19) CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci;

UPDATE t_match
SET
	home_name_en = CASE
		WHEN home_name_en IS NOT NULL AND CHAR_LENGTH(home_name_en) > 0
			AND (home_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$'
		THEN NULL
		ELSE home_name_en
	END,
	away_name_en = CASE
		WHEN away_name_en IS NOT NULL AND CHAR_LENGTH(away_name_en) > 0
			AND (away_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$'
		THEN NULL
		ELSE away_name_en
	END
WHERE
	kickoff_time IS NOT NULL
	AND CHAR_LENGTH(kickoff_time) > 0
	AND (kickoff_time COLLATE utf8mb4_general_ci) >= (@kickoff_from COLLATE utf8mb4_general_ci)
	AND (kickoff_time COLLATE utf8mb4_general_ci) <= (@kickoff_to COLLATE utf8mb4_general_ci)
	AND (
		(home_name_en IS NOT NULL AND CHAR_LENGTH(home_name_en) > 0
			AND (home_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$')
		OR
		(away_name_en IS NOT NULL AND CHAR_LENGTH(away_name_en) > 0
			AND (away_name_en COLLATE utf8mb4_general_ci) NOT REGEXP '^[A-Za-z0-9 .,''\-_&/()%\\[\\]]+$')
	);

-- 若仍报 1267：把上面时间条件整块换成按 DATETIME 比较（避免字符串 collation）：
-- AND STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s') >= '2025-01-01 00:00:00'
-- AND STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s') <= '2025-12-31 23:59:59'

-- ---------------------------------------------------------------------------
-- 若 kickoff_time 格式不固定，可改为按日期解析（示例：常见 'YYYY-MM-DD HH:MM:SS'）
-- ---------------------------------------------------------------------------
-- WHERE
--   STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s') IS NOT NULL
--   AND DATE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s')) >= '2025-01-01'
--   AND DATE(STR_TO_DATE(kickoff_time, '%Y-%m-%d %H:%i:%s')) <= '2025-12-31'
--   AND ( ... 同上 home_name_en / away_name_en 条件 ... );
