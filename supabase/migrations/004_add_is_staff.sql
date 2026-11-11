-- 004: profiles に is_staff 列を追加
-- 管理者がシフトにも入る場合に true にする。初期値 false。
-- is_staff = true の管理者はスタッフ一覧・提出状況の集計に含まれる。

alter table profiles
  add column if not exists is_staff boolean not null default false;
