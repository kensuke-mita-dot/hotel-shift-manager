# Claude Code への指示書

> リポジトリの直下に `design_handoff_hotel_shift/` を置き、Claude Code に次の文章をそのまま渡してください。
> タスクは `docs/04_tasks.md` の順に、1つずつ依頼するのがおすすめです。

---

## 最初に渡す文章

```
このリポジトリ（Next.js 14 App Router + Tailwind + shadcn/ui + Supabase）を、
design_handoff_hotel_shift/ の仕様に沿って作り直します。

まず次の資料をすべて読んでください。
- design_handoff_hotel_shift/README.md
- design_handoff_hotel_shift/docs/requirements.md（業務ルール）
- design_handoff_hotel_shift/docs/01_screens.md（画面仕様）
- design_handoff_hotel_shift/docs/02_database.md と supabase/003_v2_schema.sql
- design_handoff_hotel_shift/docs/03_rls.md
- design_handoff_hotel_shift/docs/04_tasks.md（リリース1は10/31まで。スタッフの希望入力を最優先）
- design_handoff_hotel_shift/prototype/shift-data.js（ロジックの見本）

読み終えたら、コードはまだ書かずに次の3点を返してください。
1. 既存コードのうち「残す／書き換える／削除する」ファイルの一覧
2. 仕様で不明な点・矛盾している点
3. docs/04_tasks.md のタスク1から始める場合の、具体的な変更ファイル一覧
```

## 守ってほしいルール（CLAUDE.md に入れる）

```
# プロジェクトのルール

## 技術
- Next.js 14 App Router / TypeScript strict / Tailwind / shadcn/ui / Supabase（@supabase/ssr）
- データの読み書きは src/lib/repo/ 配下の関数に集約する。画面から supabase を直接呼ばない
- 書き込みは Server Actions。権限は必ず RLS で守る（画面側のチェックだけに頼らない）
- service role キー（createAdminClient）は招待・メール送信など必要な箇所だけで使う
- メールは src/lib/mail.ts（nodemailer + SMTP 環境変数）経由で送る。当面は Google Workspace の SMTP

## 業務ルール（変更しない）
- 時刻は日本時間。シフトは date + start_time + end_time。end <= start は翌日終了
- 希望の種類：morning / evening / both（朝夕どちらも可）/ night / off / custom（時刻指定）。行なし＝空欄
- 希望は施設を指定しない。勤務施設は管理者が決める
- 「朝夕」の希望は、朝・夕・MAHTの基本のどれに配置しても希望どおりとみなす
- チェック（警告のみ・保存は止めない）
  - 欠員：枠に重なるシフト数 < 最低人数（日別の上書きがあれば優先）
  - インターバル：同じスタッフの勤務終了→次の勤務開始が 8時間未満（施設をまたいで判定）
  - 重複：同じスタッフの勤務時間が重なる（施設をまたいで判定）
  - 時間指定が枠の一部だけにかかる場合も人数に数え、「一部」と表示する
- 確定：shifts（下書き）を published_shifts（公開版）へ施設・月単位でコピー。差分のあるスタッフにメール
- 提出期限：対象月の前月15日 23:59。管理者がスタッフごとに延長できる

## 画面
- スマホ優先。タップ領域 44px 以上。文言はモック（prototype/）のとおり
- 色・フォントは README の「デザイントークン」を tailwind.config.ts に登録して使う

## 進め方
- 古いコード・使わないファイルは削除してよい（docs/04_tasks.md タスク1の一覧）
- リリース1（ログイン・希望入力・スタッフ管理）を最優先。管理者の調整画面はその後
- 1タスクごとに、変更内容と確認手順を報告してから次へ進む
- DB の変更は supabase/migrations/ に番号付きの SQL として追加する
- ロジック（src/lib/rules.ts）には単体テストを付ける（prototype/shift-data.js の violations と同じ結果になること）
```

## タスクごとの依頼文の例

```
docs/04_tasks.md のタスク3「チェックロジック」を実装してください。
prototype/shift-data.js の violations / checkCandidate / minFor を
src/lib/rules.ts に TypeScript で移植し、vitest でテストを書いてください。
テストケースには shift-data.js の seed にある3つの例
（鈴木 9→10日、佐藤 15日BHJ夜→16日MAHT、井上 20日の重複）を含めてください。
```
