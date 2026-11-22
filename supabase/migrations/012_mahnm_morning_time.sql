-- ============================================================
-- 012: MAHNM の朝勤を 09:00-17:00 に変更
-- 枠の設定に加えて、入力済み・公開済みのシフトのうち
-- 旧設定（朝勤 08:00-16:00、朝夕通しの開始 08:00）のままのものを直す。
-- ============================================================
update facility_slots set start_time = '09:00', end_time = '17:00'
where facility_id = 'MAHNM' and key = 'morning';

update shifts set start_time = '09:00', end_time = '17:00'
where facility_id = 'MAHNM' and kind = 'morning' and start_time = '08:00' and end_time = '16:00';
update shifts set start_time = '09:00'
where facility_id = 'MAHNM' and kind = 'both' and start_time = '08:00';

update published_shifts set start_time = '09:00', end_time = '17:00'
where facility_id = 'MAHNM' and kind = 'morning' and start_time = '08:00' and end_time = '16:00';
update published_shifts set start_time = '09:00'
where facility_id = 'MAHNM' and kind = 'both' and start_time = '08:00';
