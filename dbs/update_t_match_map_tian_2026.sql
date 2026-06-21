-- t_match map_tian_match_id 映射 (titan007 -> 2026世界杯)
-- 生成时间: 2026-06-06
-- 数据源: titan-cupmatch-2026-s75.json + db-wc-matches-stauiums-2026.json
-- 待更新: 46 场, 已有映射跳过: 2 场, 无法匹配: 25 场
-- 说明: titan 数据仅含 A-H 组(48场小组赛), db 含 A-L 组(73场), I-L 组暂无 titan 对应

START TRANSACTION;

-- ========== 已有映射(跳过) ==========
-- match_id=4425495 already -> titan 2906754 (2026-06-12 10:00 韩国 vs 捷克)
-- match_id=4114226 already -> titan 2906701 (2026-06-12 03:00 墨西哥 vs 南非)

-- 2026-06-13 03:00 加拿大 vs 波黑 (titan 2906756, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906756cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4425473';

-- 2026-06-13 09:00 美国 vs 巴拉圭 (titan 2906706, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906706cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114274';

-- 2026-06-14 03:00 卡塔尔 vs 瑞士 (titan 2906707, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906707cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114250';

-- 2026-06-14 06:00 巴西 vs 摩洛哥 (titan 2906710, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906710cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114260';

-- 2026-06-14 09:00 海地 vs 苏格兰 (titan 2906711, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906711cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114266';

-- 2026-06-14 12:00 澳大利亚 vs 土耳其 (titan 2906757, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906757cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4425488';

-- 2026-06-15 01:00 德国 vs 库拉索 (titan 2906713, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906713cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114270';

-- 2026-06-15 04:00 荷兰 vs 日本 (titan 2906714, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906714cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114268';

-- 2026-06-15 07:00 科特迪瓦 vs 厄瓜多尔 (titan 2906712, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906712cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114273';

-- 2026-06-15 10:00 瑞典 vs 突尼斯 (titan 2906758, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906758cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4425422';

-- 2026-06-16 00:00 西班牙 vs 佛得角共和国 (titan 2906725, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906725cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114275';

-- 2026-06-16 03:00 比利时 vs 埃及 (titan 2906720, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906720cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114276';

-- 2026-06-16 06:00 沙特阿拉伯 vs 乌拉圭 (titan 2906723, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906723cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114265';

-- 2026-06-16 09:00 伊朗 vs 新西兰 (titan 2906721, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906721cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4114277';

-- 2026-06-19 00:00 捷克 vs 南非 (titan 2907339, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907339cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4468652';

-- 2026-06-19 03:00 瑞士 vs 波黑 (titan 2907340, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907340cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532974';

-- 2026-06-19 06:00 加拿大 vs 卡塔尔 (titan 2906945, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906945cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532973';

-- 2026-06-19 09:00 墨西哥 vs 韩国 (titan 2906943, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906943cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532968';

-- 2026-06-20 03:00 美国 vs 澳大利亚 (titan 2906951, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906951cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532977';

-- 2026-06-20 06:00 苏格兰 vs 摩洛哥 (titan 2906948, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906948cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532976';

-- 2026-06-20 08:30 巴西 vs 海地 (titan 2906947, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906947cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4199447';

-- 2026-06-20 11:00 土耳其 vs 巴拉圭 (titan 2907341, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907341cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532995';

-- 2026-06-21 01:00 荷兰 vs 瑞典 (titan 2907357, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907357cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532996';

-- 2026-06-21 04:00 德国 vs 科特迪瓦 (titan 2906954, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906954cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532997';

-- 2026-06-21 08:00 厄瓜多尔 vs 库拉索 (titan 2906953, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906953cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4532998';

-- 2026-06-21 12:00 突尼斯 vs 日本 (titan 2906957, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906957cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4533002';

-- 2026-06-22 00:00 西班牙 vs 沙特阿拉伯 (titan 2906963, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906963cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4533025';

-- 2026-06-22 03:00 比利时 vs 伊朗 (titan 2906959, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906959cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4585363';

-- 2026-06-22 06:00 乌拉圭 vs 佛得角共和国 (titan 2906964, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906964cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4533031';

-- 2026-06-22 09:00 新西兰 vs 埃及 (titan 2906960, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906960cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4533030';

-- 2026-06-25 03:00 瑞士 vs 加拿大 (titan 2906946, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906946cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616612';

-- 2026-06-25 03:00 波黑 vs 卡塔尔 (titan 2907368, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907368cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616610';

-- 2026-06-25 06:00 摩洛哥 vs 海地 (titan 2906950, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906950cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616694';

-- 2026-06-25 06:00 苏格兰 vs 巴西 (titan 2906949, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906949cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4199446';

-- 2026-06-25 09:00 南非 vs 韩国 (titan 2906944, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906944cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616699';

-- 2026-06-25 09:00 捷克 vs 墨西哥 (titan 2907367, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907367cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616607';

-- 2026-06-26 04:00 厄瓜多尔 vs 德国 (titan 2906956, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906956cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616697';

-- 2026-06-26 04:00 库拉索 vs 科特迪瓦 (titan 2906955, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906955cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616698';

-- 2026-06-26 07:00 日本 vs 瑞典 (titan 2907369, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907369cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616707';

-- 2026-06-26 07:00 突尼斯 vs 荷兰 (titan 2906958, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906958cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616701';

-- 2026-06-26 10:00 巴拉圭 vs 澳大利亚 (titan 2906952, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906952cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616706';

-- 2026-06-26 10:00 土耳其 vs 美国 (titan 2907370, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2907370cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616700';

-- 2026-06-27 08:00 佛得角共和国 vs 沙特阿拉伯 (titan 2906965, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906965cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616711';

-- 2026-06-27 08:00 乌拉圭 vs 西班牙 (titan 2906966, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906966cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616710';

-- 2026-06-27 11:00 新西兰 vs 比利时 (titan 2906962, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906962cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616695';

-- 2026-06-27 11:00 埃及 vs 伊朗 (titan 2906961, exact)
UPDATE t_match SET map_tian_match_id = 'https://live.titan007.com/detail/2906961cn.htm?lineup=1', updated_time = NOW() WHERE match_id = '4616708';

COMMIT;

-- ========== 未匹配 db 比赛 ==========
-- match_id=4616712 | 2026-06-28 10:00 | 约旦 vs 阿根廷 | R3 J
-- match_id=4616702 | 2026-06-28 10:00 | 阿尔及利亚 vs 奧地利 | R3 J
-- match_id=4616703 | 2026-06-28 07:30 | 刚果民主共和国 vs 乌兹别克斯坦 | R3 K
-- match_id=4544307 | 2026-06-28 07:30 | 哥伦比亚 vs 葡萄牙 | R3 K
-- match_id=4616705 | 2026-06-28 05:00 | 克罗地亚 vs 加纳 | R3 L
-- match_id=4616704 | 2026-06-28 05:00 | 巴拿马 vs 英格兰 | R3 L
-- match_id=4616709 | 2026-06-27 03:00 | 挪威 vs 法国 | R3 I
-- match_id=4616696 | 2026-06-27 03:00 | 塞内加尔 vs 伊拉克 | R3 I
-- match_id=4483176 | 2026-06-24 10:00 | 哥伦比亚 vs 刚果民主共和国 | R2 K
-- match_id=4533048 | 2026-06-24 07:00 | 巴拿马 vs 克罗地亚 | R2 L
-- match_id=4533047 | 2026-06-24 04:00 | 英格兰 vs 加纳 | R2 L
-- match_id=4533046 | 2026-06-24 01:00 | 葡萄牙 vs 乌兹别克斯坦 | R2 K
-- match_id=4533034 | 2026-06-23 11:00 | 约旦 vs 阿尔及利亚 | R2 J
-- match_id=4533033 | 2026-06-23 08:00 | 挪威 vs 塞内加尔 | R2 I
-- match_id=4533028 | 2026-06-23 05:00 | 法国 vs 伊拉克 | R2 I
-- match_id=4533029 | 2026-06-23 01:00 | 阿根廷 vs 奧地利 | R2 J
-- match_id=4115989 | 2026-06-18 10:00 | 乌兹别克斯坦 vs 哥伦比亚 | R1 K
-- match_id=4115991 | 2026-06-18 07:00 | 加纳 vs 巴拿马 | R1 L
-- match_id=4115990 | 2026-06-18 04:00 | 英格兰 vs 克罗地亚 | R1 L
-- match_id=4425525 | 2026-06-18 01:00 | 葡萄牙 vs 刚果民主共和国 | R1 K
-- match_id=4117299 | 2026-06-17 12:00 | 奧地利 vs 约旦 | R1 J
-- match_id=4115988 | 2026-06-17 12:00 | 奧地利 vs 约旦 | R1 J
-- match_id=4115987 | 2026-06-17 09:00 | 阿根廷 vs 阿尔及利亚 | R1 J
-- match_id=4426058 | 2026-06-17 06:00 | 伊拉克 vs 挪威 | R1 I
-- match_id=4115986 | 2026-06-17 03:00 | 法国 vs 塞内加尔 | R1 I

-- ========== 未匹配 titan 比赛 (32 场) ==========
-- titan 2907376 | 2026-06-29 03:00 | [A2] vs [B2] | 三十二强 R
-- titan 2907377 | 2026-06-30 01:00 | [C1] vs [F2] | 三十二强 R
-- titan 2907378 | 2026-06-30 04:30 | [E1] vs [A3]/[B3]/[C3]/[D3]/[F3] | 三十二强 R
-- titan 2907379 | 2026-06-30 09:00 | [F1] vs [C2] | 三十二强 R
-- titan 2907380 | 2026-07-01 01:00 | [E2] vs [I2] | 三十二强 R
-- titan 2907381 | 2026-07-01 05:00 | [I1] vs [C3]/[D3]/[F3]/[G3]/[H3] | 三十二强 R
-- titan 2907382 | 2026-07-01 09:00 | [A1] vs [C3]/[E3]/[F3]/[H3]/[I3] | 三十二强 R
-- titan 2907383 | 2026-07-02 00:00 | [L1] vs [E3]/[H3]/[I3]/[J3]/[K3] | 三十二强 R
-- titan 2907384 | 2026-07-02 04:00 | [G1] vs [A3]/[E3]/[H3]/[I3]/[J3] | 三十二强 R
-- titan 2907385 | 2026-07-02 08:00 | [D1] vs [B3]/[E3]/[F3]/[I3]/[J3] | 三十二强 R
-- titan 2907386 | 2026-07-03 03:00 | [H1] vs [J2] | 三十二强 R
-- titan 2907387 | 2026-07-03 07:00 | [K2] vs [L2] | 三十二强 R
-- titan 2907388 | 2026-07-03 11:00 | [B1] vs [E3]/[F3]/[G3]/[I3]/[J3] | 三十二强 R
-- titan 2907389 | 2026-07-04 02:00 | [D2] vs [G2] | 三十二强 R
-- titan 2907390 | 2026-07-04 06:00 | [J1] vs [H2] | 三十二强 R
-- titan 2907391 | 2026-07-04 09:30 | [K1] vs [D3]/[E3]/[I3]/[J3]/[L3] | 三十二强 R
-- titan 2907393 | 2026-07-05 01:00 | 73胜者 vs 75胜者 | 十六强 R
-- titan 2907392 | 2026-07-05 05:00 | 74胜者 vs 77胜者 | 十六强 R
-- titan 2907394 | 2026-07-06 04:00 | 76胜者 vs 78胜者 | 十六强 R
-- titan 2907395 | 2026-07-06 08:00 | 79胜者 vs 80胜者 | 十六强 R
-- titan 2907396 | 2026-07-07 03:00 | 83胜者 vs 84胜者 | 十六强 R
-- titan 2907397 | 2026-07-07 08:00 | 81胜者 vs 82胜者 | 十六强 R
-- titan 2907398 | 2026-07-08 00:00 | 86胜者 vs 88胜者 | 十六强 R
-- titan 2907399 | 2026-07-08 04:00 | 85胜者 vs 87胜者 | 十六强 R
-- titan 2907400 | 2026-07-10 04:00 | 89胜者 vs 90胜者 | 半准决赛 R
-- titan 2907401 | 2026-07-11 03:00 | 93胜者 vs 94胜者 | 半准决赛 R
-- titan 2907402 | 2026-07-12 05:00 | 91胜者 vs 92胜者 | 半准决赛 R
-- titan 2907403 | 2026-07-12 09:00 | 95胜者 vs 96胜者 | 半准决赛 R
-- titan 2907404 | 2026-07-15 03:00 | 97胜者 vs 98胜者 | 准决赛 R
-- titan 2907405 | 2026-07-16 03:00 | 99胜者 vs 100胜者 | 准决赛 R
-- titan 2907407 | 2026-07-19 05:00 | 101败者 vs 102败者 | 季军赛 R
-- titan 2907406 | 2026-07-20 03:00 | 101胜者 vs 102胜者 | 决赛 R