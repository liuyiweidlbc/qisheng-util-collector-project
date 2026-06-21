SELECT 
    map_500_match_id,
    map_tian_match_id, 
    map_sofa_match_id,
    t.match_id,
    t.home_name,
    t.away_name,
    t.kickoff_time,
    t.final_score,
    t.status,
    ext.match_num,
    ext.league_name,
    ext.match_date,
    ext.match_time
FROM t_match t
INNER JOIN t_match_ext ext ON t.match_id = ext.match_id
WHERE t.kickoff_time BETWEEN 
    DATE_SUB(CURDATE(), INTERVAL 24 HOUR) 
    AND DATE_ADD(CURDATE(), INTERVAL 36 HOUR)
  AND (t.final_score IS NULL OR t.final_score = '' OR t.final_score = '0-0')
ORDER BY ext.match_date asc, ext.match_num asc;