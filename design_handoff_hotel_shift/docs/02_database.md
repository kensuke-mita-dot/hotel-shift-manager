# データベース設計

SQL の本体：`supabase/003_v2_schema.sql`（リポジトリの `supabase/migrations/003_v2_schema.sql` として追加）

## 方針

- 既存の `shift_wishes`／`shifts` は1施設・固定枠の前提なので、**作り直す**。本番データがまだないことを前提に、003 で古いテーブルを削除する。本番データがある場合は実行しないこと。
- 時刻は日本時間の `date` と `time` で持つ。日をまたぐシフトは `end_time <= start_time` で表す。比較用に `starts_at`／`ends_at`（タイムゾーンなしの timestamp）を自動計算の列として持つ。
- 下書き（`shifts`）と公開版（`published_shifts`）を分ける。スタッフは公開版だけを読む。これで「調整中の内容がスタッフに見える」ことを防ぎ、再公開のときの差分（誰に通知するか）も正確に出せる。
- 変更履歴（`history`）は、トリガーで自動記録する。画面は Phase 2。

## テーブル一覧

### facilities（施設）
| 列 | 型 | 説明 |
| --- | --- | --- |
| id | text PK | 'BHJ' など |
| name | text | 表示名 |
| sort | int | 並び順 |

### facility_slots（施設ごとの標準枠）
| 列 | 型 | 説明 |
| --- | --- | --- |
| id | uuid PK | |
| facility_id | text FK | |
| key | text | 'morning'／'evening'／'night'／'base' |
| label | text | 朝／夕／夜／基本 |
| start_time, end_time | time | 夜は 22:00 → 08:00 |
| min_staff | int | 標準の最低人数（1〜5） |
| sort | int | |
一意：(facility_id, key)

### min_overrides（日別の最低人数）
(facility_id, date, slot_key) を主キーにし、min_staff を持つ。

### profiles（既存を拡張）
| 追加する列 | 型 | 説明 |
| --- | --- | --- |
| email | text | 招待時に入れる |
| is_active | bool | false でログイン不可（退職） |
| hire_date | date | 交通費上限の判定用（Phase 2） |
| cum_days_initial | int | 累計勤務日数の初期値（手入力・Phase 2） |

`department` は使わない（残してよい）。

### staff_pay（給与情報・管理者だけが見られる）
staff_id（PK）、hourly_wage、transport_type（'per_shift'／'monthly'）、transport_amount。`profiles` と分けるのは、スタッフ同士で名前は見えても時給は見えないようにするため。

### staff_facilities（所属・兼任）
| 列 | 型 | 説明 |
| --- | --- | --- |
| staff_id | uuid FK | |
| facility_id | text FK | |
| is_primary | bool | 主な所属（1人1施設だけ true。部分一意インデックスで保証） |
主キー：(staff_id, facility_id)

### shift_requests（希望）
| 列 | 型 | 説明 |
| --- | --- | --- |
| id | uuid PK | |
| staff_id | uuid FK | |
| date | date | |
| type | request_type | morning／evening／both／night／off／custom |
| start_time, end_time | time | custom のときだけ必須 |
一意：(staff_id, date)。**行がない日＝空欄**。

### request_submissions（提出状況）
| 列 | 型 | 説明 |
| --- | --- | --- |
| staff_id | uuid | |
| month | date | 対象月の1日 |
| submitted_at | timestamptz | 最後に提出した日時 |
| extended_until | date | 管理者が延長した期限（null＝延長なし） |
主キー：(staff_id, month)

期限：`request_deadline(month)` ＝ 前月15日の 23:59:59（日本時間）。延長があればそちらを使う。

### shifts（下書き）
| 列 | 型 | 説明 |
| --- | --- | --- |
| id | uuid PK | |
| facility_id | text FK | 勤務施設 |
| staff_id | uuid FK | |
| date | date | 開始日 |
| kind | text | 枠の key または 'custom' |
| start_time, end_time | time | 枠の場合も時刻をコピーして持つ |
| starts_at, ends_at | timestamp（自動計算） | チェック用 |
| source | shift_source | staff_request／admin／ai_draft |
| status | shift_status | draft／confirmed（公開版と同じなら confirmed） |
| updated_by | uuid | 最後に変更した管理者 |
一意：(staff_id, date, facility_id)

### published_shifts（公開版）
`shifts` と同じ列に、published_at と published_by を加える。`publish_shifts()` で施設・月単位にまるごと置き換える。

### history（変更履歴・追記のみ）
| 列 | 型 | 説明 |
| --- | --- | --- |
| id | bigserial | |
| at | timestamptz | |
| actor_id | uuid | auth.uid() |
| table_name | text | |
| action | text | insert／update／delete／publish／extend |
| facility_id, staff_id, date | | 絞り込み用 |
| before, after | jsonb | 変更前後の行 |

対象テーブル：shifts、shift_requests、request_submissions、min_overrides、facility_slots、staff_pay、staff_facilities。

## 関数（RPC）

| 関数 | 呼ぶ人 | 内容 |
| --- | --- | --- |
| `is_admin()` | RLS内 | 既存の `get_my_role()='admin'` を包む |
| `my_facility_ids()` | RLS内 | 自分が所属する施設のID一覧 |
| `request_deadline(month)` | 誰でも | 前月15日 23:59:59 JST |
| `can_edit_requests(staff, month)` | RLS内 | 今が期限（延長を含む）より前か |
| `submit_requests(month)` | スタッフ | 自分の submitted_at を記録 |
| `facility_roster(facility)` | スタッフ・管理者 | 施設に所属する人の id と名前だけを返す（確定シフト表用） |
| `publish_shifts(facility, month)` | 管理者 | 下書きを公開版にコピーし、差分のあったスタッフの id を返す |
| `extend_deadline(staff, month, until)` | 管理者 | 延長日をセット（null で取り消し） |

## 初期データ

003 の末尾で、5施設と各施設の枠を登録します（要件定義 v0.2 の表のとおり）。スタッフは管理画面から招待します（データ移行はしません）。
