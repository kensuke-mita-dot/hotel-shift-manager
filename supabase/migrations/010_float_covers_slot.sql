-- ============================================================
-- 010: 浮きシフトを朝・夕などの人数に数える ＋ 有給を「人×日」で1つに
-- ============================================================

-- 1. 浮きのとき、人数（欠員チェック）に数える枠。null なら数えない
alter table shifts add column if not exists covers_slot text;
alter table shifts drop constraint if exists shifts_covers_slot_check;
alter table shifts add constraint shifts_covers_slot_check
  check (covers_slot is null or (kind = 'custom' and covers_slot in ('morning', 'evening', 'night', 'base')));

-- 2. 同じ人・同じ日に複数施設で入っている有給を1つにまとめる（最初に入れたものを残す）
delete from shifts s
using shifts t
where s.kind = 'paid_leave' and t.kind = 'paid_leave'
  and s.staff_id = t.staff_id and s.date = t.date
  and (s.updated_at, s.id) > (t.updated_at, t.id);
