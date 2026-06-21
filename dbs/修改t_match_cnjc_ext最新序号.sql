-- 查询 t_match_cnjc_ext 表中 HAD 和 HHAD 最新序号与 t_market_support_cnjc 表中对应最大序列号不一致的比赛
-- 
-- 说明：
-- - t_match_cnjc_ext.match_id 对应 t_market_support_cnjc.cnjc_match_id
-- - latest_had_sequence 应该等于 t_market_support_cnjc 中 type='HAD' 的最大 sequence_order
-- - latest_hhad_sequence 应该等于 t_market_support_cnjc 中 type='HHAD' 的最大 sequence_order

SELECT 
    ext.match_id AS cnjc_match_id,
    ext.match_id,
    ext.latest_had_sequence AS ext_had_sequence,
    had_max.max_sequence AS market_max_had_sequence,
    ext.latest_hhad_sequence AS ext_hhad_sequence,
    hhad_max.max_sequence AS market_max_hhad_sequence,
    CASE 
        WHEN COALESCE(ext.latest_had_sequence, -1) != COALESCE(had_max.max_sequence, -1)
        THEN 'HAD不一致'
        ELSE ''
    END AS had_status,
    CASE 
        WHEN COALESCE(ext.latest_hhad_sequence, -1) != COALESCE(hhad_max.max_sequence, -1)
        THEN 'HHAD不一致'
        ELSE ''
    END AS hhad_status
FROM t_match_cnjc_ext ext
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HAD'
    GROUP BY cnjc_match_id
) had_max ON ext.match_id COLLATE utf8mb4_general_ci = had_max.cnjc_match_id COLLATE utf8mb4_general_ci
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HHAD'
    GROUP BY cnjc_match_id
) hhad_max ON ext.match_id COLLATE utf8mb4_general_ci = hhad_max.cnjc_match_id COLLATE utf8mb4_general_ci
WHERE 
    -- HAD 序号不一致
    COALESCE(ext.latest_had_sequence, -1) != COALESCE(had_max.max_sequence, -1)
    -- 或者 HHAD 序号不一致
    OR COALESCE(ext.latest_hhad_sequence, -1) != COALESCE(hhad_max.max_sequence, -1)
ORDER BY ext.match_id;


-- ===========================================
-- 更新 SQL：将 HAD 和 HHAD 序列号更新为对应的最大值
-- ===========================================
-- 使用说明：
-- 1. 如果只想更新指定比赛，先设置变量：SET @cnjc_match_id = '比赛ID';
-- 2. 如果想更新全部，设置变量为空：SET @cnjc_match_id = NULL; 或者不设置变量
-- 3. 然后执行下面的 UPDATE 语句

-- 设置要更新的比赛ID（如果为 NULL 则更新全部）
-- SET @cnjc_match_id = NULL;  -- 更新全部
-- SET @cnjc_match_id = '具体比赛ID' COLLATE utf8mb4_general_ci;  -- 只更新指定比赛

UPDATE t_match_cnjc_ext ext
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_had_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HAD'
    GROUP BY cnjc_match_id
) had_max ON ext.match_id COLLATE utf8mb4_general_ci = had_max.cnjc_match_id COLLATE utf8mb4_general_ci
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_hhad_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HHAD'
    GROUP BY cnjc_match_id
) hhad_max ON ext.match_id COLLATE utf8mb4_general_ci = hhad_max.cnjc_match_id COLLATE utf8mb4_general_ci
SET 
    ext.latest_had_sequence = COALESCE(had_max.max_had_sequence, ext.latest_had_sequence),
    ext.latest_hhad_sequence = COALESCE(hhad_max.max_hhad_sequence, ext.latest_hhad_sequence)
WHERE 
    -- 如果指定了 cnjc_match_id，则只更新该比赛；否则更新全部
    (@cnjc_match_id IS NULL OR ext.match_id COLLATE utf8mb4_general_ci = CONVERT(@cnjc_match_id USING utf8mb4) COLLATE utf8mb4_general_ci)
    -- 只更新不一致的记录（且对应的最大值存在）
    AND (
        (had_max.max_had_sequence IS NOT NULL 
         AND COALESCE(ext.latest_had_sequence, -1) != COALESCE(had_max.max_had_sequence, -1))
        OR (hhad_max.max_hhad_sequence IS NOT NULL 
            AND COALESCE(ext.latest_hhad_sequence, -1) != COALESCE(hhad_max.max_hhad_sequence, -1))
    );


-- ===========================================
-- 查询不匹配的 cnjc_match_id 列表（只查询前10个）
-- ===========================================
SELECT 
    ext.match_id AS cnjc_match_id
FROM t_match_cnjc_ext ext
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HAD'
    GROUP BY cnjc_match_id
) had_max ON ext.match_id COLLATE utf8mb4_general_ci = had_max.cnjc_match_id COLLATE utf8mb4_general_ci
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HHAD'
    GROUP BY cnjc_match_id
) hhad_max ON ext.match_id COLLATE utf8mb4_general_ci = hhad_max.cnjc_match_id COLLATE utf8mb4_general_ci
WHERE 
    -- HAD 序号不一致
    COALESCE(ext.latest_had_sequence, -1) != COALESCE(had_max.max_sequence, -1)
    -- 或者 HHAD 序号不一致
    OR COALESCE(ext.latest_hhad_sequence, -1) != COALESCE(hhad_max.max_sequence, -1)
ORDER BY ext.match_id
LIMIT 10;


-- ===========================================
-- 批量更新：只更新前10个不匹配的比赛
-- ===========================================
-- 说明：先查询出不匹配的cnjc_match_id，然后只更新前10个

UPDATE t_match_cnjc_ext ext
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_had_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HAD'
    GROUP BY cnjc_match_id
) had_max ON ext.match_id COLLATE utf8mb4_general_ci = had_max.cnjc_match_id COLLATE utf8mb4_general_ci
LEFT JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_hhad_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HHAD'
    GROUP BY cnjc_match_id
) hhad_max ON ext.match_id COLLATE utf8mb4_general_ci = hhad_max.cnjc_match_id COLLATE utf8mb4_general_ci
SET 
    ext.latest_had_sequence = COALESCE(had_max.max_had_sequence, ext.latest_had_sequence),
    ext.latest_hhad_sequence = COALESCE(hhad_max.max_hhad_sequence, ext.latest_hhad_sequence)
WHERE 
    ext.match_id IN (
        SELECT match_id FROM (
            SELECT 
                ext_inner.match_id
            FROM t_match_cnjc_ext ext_inner
            LEFT JOIN (
                SELECT 
                    cnjc_match_id,
                    MAX(sequence_order) AS max_sequence
                FROM t_market_support_cnjc
                WHERE type = 'HAD'
                GROUP BY cnjc_match_id
            ) had_max_inner ON ext_inner.match_id COLLATE utf8mb4_general_ci = had_max_inner.cnjc_match_id COLLATE utf8mb4_general_ci
            LEFT JOIN (
                SELECT 
                    cnjc_match_id,
                    MAX(sequence_order) AS max_sequence
                FROM t_market_support_cnjc
                WHERE type = 'HHAD'
                GROUP BY cnjc_match_id
            ) hhad_max_inner ON ext_inner.match_id COLLATE utf8mb4_general_ci = hhad_max_inner.cnjc_match_id COLLATE utf8mb4_general_ci
            WHERE 
                -- HAD 序号不一致
                COALESCE(ext_inner.latest_had_sequence, -1) != COALESCE(had_max_inner.max_sequence, -1)
                -- 或者 HHAD 序号不一致
                OR COALESCE(ext_inner.latest_hhad_sequence, -1) != COALESCE(hhad_max_inner.max_sequence, -1)
            ORDER BY ext_inner.match_id
            LIMIT 1200
        ) AS temp
    )
    -- 只更新不一致的记录（且对应的最大值存在）
    AND (
        (had_max.max_had_sequence IS NOT NULL 
         AND COALESCE(ext.latest_had_sequence, -1) != COALESCE(had_max.max_had_sequence, -1))
        OR (hhad_max.max_hhad_sequence IS NOT NULL 
            AND COALESCE(ext.latest_hhad_sequence, -1) != COALESCE(hhad_max.max_hhad_sequence, -1))
    );


-- ===========================================
-- 查询 HAD 序列号匹配但累计盈亏字段都为0的记录
-- ===========================================
-- 说明：查询出 latest_had_sequence 是最新值（匹配），但对应的 HAD 记录中
--       won_profit_cumulative、draw_profit_cumulative、lose_profit_cumulative 同时为0

SELECT 
    ext.match_id AS cnjc_match_id,
    ext.latest_had_sequence,
    m.sequence_order AS market_sequence_order,
    m.won_profit_cumulative,
    m.draw_profit_cumulative,
    m.lose_profit_cumulative,
    m.type,
    m.created_time AS market_created_time
FROM t_match_cnjc_ext ext
INNER JOIN (
    SELECT 
        cnjc_match_id,
        MAX(sequence_order) AS max_sequence
    FROM t_market_support_cnjc
    WHERE type = 'HAD'
    GROUP BY cnjc_match_id
) had_max ON ext.match_id COLLATE utf8mb4_general_ci = had_max.cnjc_match_id COLLATE utf8mb4_general_ci
INNER JOIN t_market_support_cnjc m ON (
    ext.match_id COLLATE utf8mb4_general_ci = m.cnjc_match_id COLLATE utf8mb4_general_ci
    AND m.type = 'HAD'
    AND m.sequence_order = ext.latest_had_sequence
)
WHERE 
    -- HAD 序列号匹配（是最新值）
    ext.latest_had_sequence = had_max.max_sequence
    -- 且对应的记录中三个累计盈亏字段都为0
    AND COALESCE(m.won_profit_cumulative, 0) = 0
    AND COALESCE(m.draw_profit_cumulative, 0) = 0
    AND COALESCE(m.lose_profit_cumulative, 0) = 0
ORDER BY ext.match_id;


-- ===========================================
-- 查询 HAD 记录中累计盈亏字段都为0的记录（不关注序列号是否匹配）
-- ===========================================
-- 说明：查询出 t_market_support_cnjc 中 type='HAD' 且
--       won_profit_cumulative、draw_profit_cumulative、lose_profit_cumulative 同时为0的记录
--       不关注 latest_had_sequence 是否匹配最新值

SELECT 
    ext.match_id AS cnjc_match_id,
    ext.latest_had_sequence,
    m.sequence_order AS market_sequence_order,
    m.won_profit_cumulative,
    m.draw_profit_cumulative,
    m.lose_profit_cumulative,
    m.type,
    m.created_time AS market_created_time
FROM t_match_cnjc_ext ext
INNER JOIN t_market_support_cnjc m ON (
    ext.match_id COLLATE utf8mb4_general_ci = m.cnjc_match_id COLLATE utf8mb4_general_ci
    AND m.type = 'HAD'
    AND m.sequence_order = ext.latest_had_sequence
)
WHERE 
    -- 三个累计盈亏字段都为0
    COALESCE(m.won_profit_cumulative, 0) = 0
    AND COALESCE(m.draw_profit_cumulative, 0) = 0
    AND COALESCE(m.lose_profit_cumulative, 0) = 0
ORDER BY ext.match_id;

