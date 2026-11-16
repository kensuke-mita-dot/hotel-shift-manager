# HOTEL SHIFT

dot Inc. の5施設（BHJ・MAHT・BHKK・MAHNM・MAHB）向けのシフト管理ツール。

- 本番：https://dot-hotel-shift.vercel.app （Vercel プロジェクト `dot-hotel-shift`、東京リージョン hnd1）
- DB・認証：Supabase プロジェクト `hotel-shift-prod`（東京）
- 構成：Next.js 14（App Router・Server Actions）＋ Supabase ＋ Tailwind CSS

`main` に入ると Vercel が自動で本番に反映します。

---

## できること

| 画面 | パス | 内容 |
|---|---|---|
| 日次調整 | `/admin/daily` | 1日分を施設×枠で配置。勤務間隔・重複・欠員をチェック |
| 月間 | `/admin/monthly` | 1か月をスタッフ×日の表で入力（朝・夕・朝夕通し・夜・浮き・休み・有給）。日数・希望の採用率。施設ごとに公開 |
| 希望 | `/admin/requests` | スタッフの希望一覧と代理入力 |
| 人件費 | `/admin/cost` | 下書きを含むシフト × 時給・交通費の見込み |
| スタッフ | `/admin/staff` | 追加（ID＋PIN発行）・氏名/所属/時給/交通費の編集・PIN再発行・提出期限の延長・停止 |
| 確定シフト | `/staff/schedule` | 公開済みの自分のシフト |
| 希望入力 | `/staff/requests` | 来月から3か月分の希望を提出 |
| PIN変更 | `/staff/pin` | 初回ログイン時は必ずここへ誘導 |

施設の切り替え（日次・月間・希望）は複数選べる。URL は `?facility=BHJ,MAHT`、`all` は全施設。

シフトの決まりごと：
- 1人・1日・1施設につきシフトは1つ。朝と夕の両方なら「朝夕（通し）」。
- 休み・有給は「人×日」で1つ。どこかの施設で入れると、他の施設の休み・有給は外れる。表ではどの施設でも施設名なしで出る。
- 浮きは時間を指定する勤務。「夕勤として数える」などを指定したときだけ、その枠の人数（欠員チェック）に数える（`shifts.covers_slot`）。

ログイン：スタッフは **ログインID＋6桁PIN**（内部的には `<ID>@staff.hotel-shift.invalid` のメールとして Supabase Auth に登録）、管理者は **メール＋パスワード**。

---

## ディレクトリ構成

```
src/
  middleware.ts          全ページ共通の入口：ログイン確認・停止アカウントの締め出し・
                         管理者ページの保護・初期PINのままならPIN変更へ誘導
  app/
    actions/             サーバー側の処理（Server Actions）。DBの読み書きはすべてここ
      board.ts           日次・月間・希望の表データ、シフトの追加/削除/置き換え、公開
      staff.ts           スタッフ一覧・追加・編集・PIN再発行・期限延長・停止
      cost.ts            人件費の集計
      requests.ts        スタッフ本人の希望の読み込み・提出
      auth.ts            ログイン・ログアウト・PIN/パスワード変更
    admin/<画面>/        page.tsx（データ取得）＋ *Client.tsx（操作画面）
    staff/<画面>/        スタッフ用画面
    admin/loading.tsx    ページ切り替え中の表示（staff/loading.tsx も同様）
  components/            画面部品（ヘッダー・タブ・希望カレンダーなど）
  lib/
    session.ts           ログイン中ユーザーと自分のプロフィール（1回の表示の中で使い回す）
    auth-guard.ts        requireAdmin()：管理者専用の処理は必ず最初にこれを通す
    supabase-server.ts   本人の権限で動く Supabase クライアント（RLS が効く）
    supabase-admin.ts    service role（RLS を無視）。requireAdmin() の後でだけ使う
    shift-kinds.ts       シフトの種類（朝/夕/通し/夜/浮き/休み/有給）と表示・勤務時間の計算
    rules.ts             勤務間隔・重複・欠員のチェック
    requests.ts          希望の正規化・表示・入力ルール（時間指定は1日2つまで等）
    pay.ts               地域別の初期時給・有給の所定時間
    utils.ts             日付（日本時間）・施設の並び順・スタッフの並び替え
  types/index.ts         DBの行の型と共通の型
supabase/migrations/     DBの変更履歴（下記）
design_handoff_hotel_shift/  初期の設計資料・プロトタイプ（参照用。アプリからは使っていない）
```

### 権限の考え方

- 画面の表示：`middleware.ts` がログインと管理者ページを守る。
- データの読み書き：Server Action は middleware を通らないので、管理者用の処理は先頭で `requireAdmin()` を必ず呼ぶ。
  `createAdminClient()`（RLS 無視）はそのチェックの後でだけ使う。
- シフトや希望の書き込みは本人のセッション（`createClient()`）で行い、DB側の RLS でも管理者だけに制限している。

---

## DB（Supabase）

`supabase/migrations/` を番号順に Supabase の SQL Editor で実行する。本番には 010 まで適用済み。

| ファイル | 内容 |
|---|---|
| 001, 002 | 初期版（v1）。003 で作り直したので新規環境では不要 |
| 003_v2_schema | 現行スキーマ：施設・枠・所属・時給・シフト・公開版・希望・変更履歴・RLS |
| 004_add_is_staff | 管理者がシフトに入るための `is_staff` |
| 005_launch | ログインID＋PIN、初期PIN変更フラグ |
| 006_multi_requests | 1日に複数の希望 |
| 007_two_time_ranges | 時間指定の希望を1日2つまで |
| 008_paid_leave | 有給（シフト・希望） |
| 009_wage_nullable | 時給の未設定（null＝施設の初期時給）と 0円 の区別 |
| 010_float_covers_slot | 浮きを人数に数える枠（`covers_slot`）、重複していた有給の整理 |

DBを変える変更を入れるときは、新しい番号のファイルを追加し、本番で実行してからアプリをデプロイする。

---

## ローカルで動かす

```bash
npm install
# .env.local を作成（値は Vercel の Environment Variables と同じ）
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...      ← 公開しないこと
npm run dev        # http://localhost:3000
```

変更したら出す前に：

```bash
npx tsc --noEmit   # 型チェック
npm run lint
npm test           # ルール・希望・時給のテスト
npm run build
```

---

## 困ったとき

- **画面に赤いエラー**：多くは DB の列や関数が足りない（マイグレーション未適用）。メッセージに `column ... does not exist` などがあれば該当の SQL を実行する。
- **本番だけおかしい**：Vercel のダッシュボード → `dot-hotel-shift` → Logs でサーバーのエラーを確認。
- **ログインできない**：Supabase → Authentication → Users でユーザーがいるか、`profiles.is_active` が true か。スタッフのPINは管理画面の「PIN再発行」で作り直せる。
- **main に入れたのに本番が変わらない**：まれに Vercel が自動で拾わないことがある。Vercel → Deployments で最新の main を「Redeploy」する。
- **前の状態に戻したい**：Vercel → Deployments で前のデプロイを「Promote to Production」（DBは戻らないので注意）。
