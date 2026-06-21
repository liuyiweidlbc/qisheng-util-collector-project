-- t_match map_500_match_id 映射 (500彩票网 -> 2026世界杯小组赛)
-- 生成时间: 2026-06-06
-- 数据源: https://liansai.500.com/zuqiu-19476/ (API getmatch sid=19476) + db-wc-matches-stauiums-2026.json
-- 待更新: 71 场, 已有映射跳过: 2 场, 无法匹配: 0 场

START TRANSACTION;

-- ========== 已有映射(跳过) ==========
-- match_id=4425495 already -> 500 fid 1359224 (2026-06-12 10:00 韩国 vs 捷克)
-- match_id=4114226 already -> 500 fid 1359172 (2026-06-12 03:00 墨西哥 vs 南非)

-- 2026-06-13 03:00 加拿大 vs 波黑 (500 fid 1359182, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359182.shtml', updated_time = NOW() WHERE match_id = '4425473';

-- 2026-06-13 09:00 美国 vs 巴拉圭 (500 fid 1359189, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359189.shtml', updated_time = NOW() WHERE match_id = '4114274';

-- 2026-06-14 03:00 卡塔尔 vs 瑞士 (500 fid 1359227, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359227.shtml', updated_time = NOW() WHERE match_id = '4114250';

-- 2026-06-14 06:00 巴西 vs 摩洛哥 (500 fid 1359195, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359195.shtml', updated_time = NOW() WHERE match_id = '4114260';

-- 2026-06-14 09:00 海地 vs 苏格兰 (500 fid 1359230, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359230.shtml', updated_time = NOW() WHERE match_id = '4114266';

-- 2026-06-14 12:00 澳大利亚 vs 土耳其 (500 fid 1359233, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359233.shtml', updated_time = NOW() WHERE match_id = '4425488';

-- 2026-06-15 01:00 德国 vs 库拉索 (500 fid 1359200, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359200.shtml', updated_time = NOW() WHERE match_id = '4114270';

-- 2026-06-15 04:00 荷兰 vs 日本 (500 fid 1359203, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359203.shtml', updated_time = NOW() WHERE match_id = '4114268';

-- 2026-06-15 07:00 科特迪瓦 vs 厄瓜多尔 (500 fid 1359236, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359236.shtml', updated_time = NOW() WHERE match_id = '4114273';

-- 2026-06-15 10:00 瑞典 vs 突尼斯 (500 fid 1359239, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359239.shtml', updated_time = NOW() WHERE match_id = '4425422';

-- 2026-06-16 00:00 西班牙 vs 佛得角共和国 (500 fid 1359209, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359209.shtml', updated_time = NOW() WHERE match_id = '4114275';

-- 2026-06-16 03:00 比利时 vs 埃及 (500 fid 1359206, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359206.shtml', updated_time = NOW() WHERE match_id = '4114276';

-- 2026-06-16 06:00 沙特阿拉伯 vs 乌拉圭 (500 fid 1359245, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359245.shtml', updated_time = NOW() WHERE match_id = '4114265';

-- 2026-06-16 09:00 伊朗 vs 新西兰 (500 fid 1359242, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359242.shtml', updated_time = NOW() WHERE match_id = '4114277';

-- 2026-06-17 03:00 法国 vs 塞内加尔 (500 fid 1359212, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359212.shtml', updated_time = NOW() WHERE match_id = '4115986';

-- 2026-06-17 06:00 伊拉克 vs 挪威 (500 fid 1359248, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359248.shtml', updated_time = NOW() WHERE match_id = '4426058';

-- 2026-06-17 09:00 阿根廷 vs 阿尔及利亚 (500 fid 1359215, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359215.shtml', updated_time = NOW() WHERE match_id = '4115987';

-- 2026-06-17 12:00 奧地利 vs 约旦 (500 fid 1359251, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359251.shtml', updated_time = NOW() WHERE match_id = '4117299';

-- 2026-06-17 12:00 奧地利 vs 约旦 (500 fid 1359251, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359251.shtml', updated_time = NOW() WHERE match_id = '4115988';

-- 2026-06-18 01:00 葡萄牙 vs 刚果民主共和国 (500 fid 1359218, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359218.shtml', updated_time = NOW() WHERE match_id = '4425525';

-- 2026-06-18 04:00 英格兰 vs 克罗地亚 (500 fid 1359221, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359221.shtml', updated_time = NOW() WHERE match_id = '4115990';

-- 2026-06-18 07:00 加纳 vs 巴拿马 (500 fid 1359257, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359257.shtml', updated_time = NOW() WHERE match_id = '4115991';

-- 2026-06-18 10:00 乌兹别克斯坦 vs 哥伦比亚 (500 fid 1359254, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359254.shtml', updated_time = NOW() WHERE match_id = '4115989';

-- 2026-06-19 00:00 捷克 vs 南非 (500 fid 1359225, group A, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359225.shtml', updated_time = NOW() WHERE match_id = '4468652';

-- 2026-06-19 03:00 瑞士 vs 波黑 (500 fid 1359228, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359228.shtml', updated_time = NOW() WHERE match_id = '4532974';

-- 2026-06-19 06:00 加拿大 vs 卡塔尔 (500 fid 1359185, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359185.shtml', updated_time = NOW() WHERE match_id = '4532973';

-- 2026-06-19 09:00 墨西哥 vs 韩国 (500 fid 1359177, group A, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359177.shtml', updated_time = NOW() WHERE match_id = '4532968';

-- 2026-06-20 03:00 美国 vs 澳大利亚 (500 fid 1359191, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359191.shtml', updated_time = NOW() WHERE match_id = '4532977';

-- 2026-06-20 06:00 苏格兰 vs 摩洛哥 (500 fid 1359231, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359231.shtml', updated_time = NOW() WHERE match_id = '4532976';

-- 2026-06-20 08:30 巴西 vs 海地 (500 fid 1359198, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359198.shtml', updated_time = NOW() WHERE match_id = '4199447';

-- 2026-06-20 11:00 土耳其 vs 巴拉圭 (500 fid 1359234, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359234.shtml', updated_time = NOW() WHERE match_id = '4532995';

-- 2026-06-21 01:00 荷兰 vs 瑞典 (500 fid 1359204, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359204.shtml', updated_time = NOW() WHERE match_id = '4532996';

-- 2026-06-21 04:00 德国 vs 科特迪瓦 (500 fid 1359201, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359201.shtml', updated_time = NOW() WHERE match_id = '4532997';

-- 2026-06-21 08:00 厄瓜多尔 vs 库拉索 (500 fid 1359237, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359237.shtml', updated_time = NOW() WHERE match_id = '4532998';

-- 2026-06-21 12:00 突尼斯 vs 日本 (500 fid 1359240, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359240.shtml', updated_time = NOW() WHERE match_id = '4533002';

-- 2026-06-22 00:00 西班牙 vs 沙特阿拉伯 (500 fid 1359210, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359210.shtml', updated_time = NOW() WHERE match_id = '4533025';

-- 2026-06-22 03:00 比利时 vs 伊朗 (500 fid 1359207, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359207.shtml', updated_time = NOW() WHERE match_id = '4585363';

-- 2026-06-22 06:00 乌拉圭 vs 佛得角共和国 (500 fid 1359246, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359246.shtml', updated_time = NOW() WHERE match_id = '4533031';

-- 2026-06-22 09:00 新西兰 vs 埃及 (500 fid 1359243, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359243.shtml', updated_time = NOW() WHERE match_id = '4533030';

-- 2026-06-23 01:00 阿根廷 vs 奧地利 (500 fid 1359216, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359216.shtml', updated_time = NOW() WHERE match_id = '4533029';

-- 2026-06-23 05:00 法国 vs 伊拉克 (500 fid 1359213, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359213.shtml', updated_time = NOW() WHERE match_id = '4533028';

-- 2026-06-23 08:00 挪威 vs 塞内加尔 (500 fid 1359249, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359249.shtml', updated_time = NOW() WHERE match_id = '4533033';

-- 2026-06-23 11:00 约旦 vs 阿尔及利亚 (500 fid 1359252, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359252.shtml', updated_time = NOW() WHERE match_id = '4533034';

-- 2026-06-24 01:00 葡萄牙 vs 乌兹别克斯坦 (500 fid 1359219, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359219.shtml', updated_time = NOW() WHERE match_id = '4533046';

-- 2026-06-24 04:00 英格兰 vs 加纳 (500 fid 1359222, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359222.shtml', updated_time = NOW() WHERE match_id = '4533047';

-- 2026-06-24 07:00 巴拿马 vs 克罗地亚 (500 fid 1359258, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359258.shtml', updated_time = NOW() WHERE match_id = '4533048';

-- 2026-06-24 10:00 哥伦比亚 vs 刚果民主共和国 (500 fid 1359255, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359255.shtml', updated_time = NOW() WHERE match_id = '4483176';

-- 2026-06-25 03:00 瑞士 vs 加拿大 (500 fid 1359188, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359188.shtml', updated_time = NOW() WHERE match_id = '4616612';

-- 2026-06-25 03:00 波黑 vs 卡塔尔 (500 fid 1359229, group B, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359229.shtml', updated_time = NOW() WHERE match_id = '4616610';

-- 2026-06-25 06:00 摩洛哥 vs 海地 (500 fid 1359232, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359232.shtml', updated_time = NOW() WHERE match_id = '4616694';

-- 2026-06-25 06:00 苏格兰 vs 巴西 (500 fid 1359199, group C, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359199.shtml', updated_time = NOW() WHERE match_id = '4199446';

-- 2026-06-25 09:00 南非 vs 韩国 (500 fid 1359226, group A, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359226.shtml', updated_time = NOW() WHERE match_id = '4616699';

-- 2026-06-25 09:00 捷克 vs 墨西哥 (500 fid 1359179, group A, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359179.shtml', updated_time = NOW() WHERE match_id = '4616607';

-- 2026-06-26 04:00 厄瓜多尔 vs 德国 (500 fid 1359202, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359202.shtml', updated_time = NOW() WHERE match_id = '4616697';

-- 2026-06-26 04:00 库拉索 vs 科特迪瓦 (500 fid 1359238, group E, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359238.shtml', updated_time = NOW() WHERE match_id = '4616698';

-- 2026-06-26 07:00 日本 vs 瑞典 (500 fid 1359241, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359241.shtml', updated_time = NOW() WHERE match_id = '4616707';

-- 2026-06-26 07:00 突尼斯 vs 荷兰 (500 fid 1359205, group F, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359205.shtml', updated_time = NOW() WHERE match_id = '4616701';

-- 2026-06-26 10:00 巴拉圭 vs 澳大利亚 (500 fid 1359235, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359235.shtml', updated_time = NOW() WHERE match_id = '4616706';

-- 2026-06-26 10:00 土耳其 vs 美国 (500 fid 1359193, group D, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359193.shtml', updated_time = NOW() WHERE match_id = '4616700';

-- 2026-06-27 03:00 挪威 vs 法国 (500 fid 1359214, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359214.shtml', updated_time = NOW() WHERE match_id = '4616709';

-- 2026-06-27 03:00 塞内加尔 vs 伊拉克 (500 fid 1359250, group I, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359250.shtml', updated_time = NOW() WHERE match_id = '4616696';

-- 2026-06-27 08:00 佛得角共和国 vs 沙特阿拉伯 (500 fid 1359247, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359247.shtml', updated_time = NOW() WHERE match_id = '4616711';

-- 2026-06-27 08:00 乌拉圭 vs 西班牙 (500 fid 1359211, group H, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359211.shtml', updated_time = NOW() WHERE match_id = '4616710';

-- 2026-06-27 11:00 新西兰 vs 比利时 (500 fid 1359208, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359208.shtml', updated_time = NOW() WHERE match_id = '4616695';

-- 2026-06-27 11:00 埃及 vs 伊朗 (500 fid 1359244, group G, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359244.shtml', updated_time = NOW() WHERE match_id = '4616708';

-- 2026-06-28 05:00 克罗地亚 vs 加纳 (500 fid 1359259, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359259.shtml', updated_time = NOW() WHERE match_id = '4616705';

-- 2026-06-28 05:00 巴拿马 vs 英格兰 (500 fid 1359223, group L, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359223.shtml', updated_time = NOW() WHERE match_id = '4616704';

-- 2026-06-28 07:30 刚果民主共和国 vs 乌兹别克斯坦 (500 fid 1359256, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359256.shtml', updated_time = NOW() WHERE match_id = '4616703';

-- 2026-06-28 07:30 哥伦比亚 vs 葡萄牙 (500 fid 1359220, group K, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359220.shtml', updated_time = NOW() WHERE match_id = '4544307';

-- 2026-06-28 10:00 约旦 vs 阿根廷 (500 fid 1359217, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359217.shtml', updated_time = NOW() WHERE match_id = '4616712';

-- 2026-06-28 10:00 阿尔及利亚 vs 奧地利 (500 fid 1359253, group J, exact)
UPDATE t_match SET map_500_match_id = 'https://odds.500.com/fenxi/shuju-1359253.shtml', updated_time = NOW() WHERE match_id = '4616702';

COMMIT;