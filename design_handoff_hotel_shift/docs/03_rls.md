# 権限（RLS）の設計

役割は2つです：`staff`（スタッフ）と `admin`（管理者・1種類で全施設を見られる）。
すべてのテーブルで RLS を有効にします。判定には SECURITY DEFINER の関数（`is_admin()`、`my_facility_ids()`）を使い、002 で直したポリシーの無限再帰を起こさないようにします。

## 一覧

| テーブル | スタッフ | 管理者 |
| --- | --- | --- |
| facilities／facility_slots／min_overrides | 読む | 読む・書く |
| profiles | 自分の行を読む | 全員分を読む・更新する |
| staff_pay | **読めない** | 読む・書く |
| staff_facilities | 自分の行を読む | 読む・書く |
| shift_requests | 自分の行を読む。**期限内だけ**追加・更新・削除できる | 読む・書く |
| request_submissions | 自分の行を読む（書き込みは `submit_requests()` 経由） | 読む・書く |
| shifts（下書き） | **読めない** | 読む・書く |
| published_shifts（公開版） | 自分が所属する施設の行を読む | 読む（書き込みは `publish_shifts()` 経由） |
| history | 読めない | 読む（誰も更新・削除できない） |

## ポイント

1. **時給はスタッフに見せない**：給与情報は `staff_pay` に分けて、管理者だけが読めるようにする。確定シフト表に出す同僚の名前は `facility_roster()` で id と名前だけを返す。
2. **下書きはスタッフに見せない**：スタッフには `shifts` の読み取り権限を与えず、`published_shifts` だけを読ませる。
3. **他施設の勤務の表示**：兼任者の行に「MAHT」と出すには、所属施設以外の公開版も読む必要がある。`published_shifts` の読み取り条件を「施設が自分の所属先」または「スタッフが自分の所属施設の人」とする（`staff_in_my_facilities(staff_id)` で判定）。
4. **期限のチェックはDB側で**：`shift_requests` の書き込み条件に `can_edit_requests(staff_id, date_trunc('month', date))` を入れる。画面の制御だけに頼らない。
5. **履歴は改ざんできない**：`history` には insert／update／delete のポリシーを作らない。トリガー関数（SECURITY DEFINER）だけが書き込む。
6. **退職者**：`is_active=false` の人は、ミドルウェアでログアウトさせる。RLS の関数でも `is_active` を確認する。
7. **service role キー**：招待、メール送信先の取得、ユーザーの停止だけで使う。画面からは使わない。

## 確認用のテスト（Supabase の SQL Editor で実行）

```sql
-- スタッフとして振る舞う
set local role authenticated;
set local request.jwt.claims = '{"sub":"<スタッフのuuid>","role":"authenticated"}';

select * from staff_pay;                 -- 0件であること
select * from shifts;                    -- 0件であること
select * from published_shifts;          -- 所属施設（と兼任者の他施設分）だけ
insert into shift_requests (staff_id, date, type)
values ('<スタッフのuuid>', '2026-11-03', 'morning'); -- 期限後ならエラーになること
```
