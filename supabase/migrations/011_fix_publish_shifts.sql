-- ============================================================
-- 011: 公開（publish_shifts）の修正
-- 戻り値の staff_id とテーブルの列 staff_id がぶつかり
-- 「column reference "staff_id" is ambiguous」で公開できなかった。
-- 列を優先する指定（#variable_conflict use_column）を入れ、列名も表の別名付きで書く。
-- ============================================================
create or replace function publish_shifts(p_facility text, p_month date)
returns table (staff_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not is_admin() then raise exception 'forbidden'; end if;

  -- 前回の公開から変わったスタッフ
  create temp table _changed on commit drop as
  select coalesce(s.staff_id, p.staff_id) as changed_staff
  from (select * from shifts x where x.facility_id = p_facility and x.date between v_from and v_to) s
  full join (select * from published_shifts y where y.facility_id = p_facility and y.date between v_from and v_to) p
    on s.staff_id = p.staff_id and s.date = p.date
  where s.id is null or p.id is null or s.kind <> p.kind or s.start_time <> p.start_time or s.end_time <> p.end_time;

  delete from published_shifts y where y.facility_id = p_facility and y.date between v_from and v_to;
  insert into published_shifts (id, facility_id, staff_id, date, kind, start_time, end_time, published_by)
  select x.id, x.facility_id, x.staff_id, x.date, x.kind, x.start_time, x.end_time, auth.uid()
  from shifts x where x.facility_id = p_facility and x.date between v_from and v_to;
  update shifts x set status = 'confirmed' where x.facility_id = p_facility and x.date between v_from and v_to;

  insert into history (actor_id, table_name, action, facility_id, after)
  values (auth.uid(), 'published_shifts', 'publish', p_facility,
          jsonb_build_object('month', v_from, 'changed_staff', (select count(distinct c.changed_staff) from _changed c)));

  return query select distinct c.changed_staff from _changed c;
end; $$;
