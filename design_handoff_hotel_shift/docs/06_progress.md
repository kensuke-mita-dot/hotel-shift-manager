# 環境の準備：進捗メモ（2026-10-26）

キーやパスワードはここに書かないこと。

| 項目 | 状況 | メモ |
| --- | --- | --- |
| Google Workspace エイリアス | 済 | `shift@dotincrecruit.com`（info@ のエイリアス） |
| 2段階認証・アプリ パスワード | 済 | info@ のアカウントで作成（名前「シフト管理」） |
| Gmail の送信元に追加 | 済 | 「シフト管理 <shift@dotincrecruit.com>」 |
| Supabase 本番プロジェクト | 済 | `hotel-shift-prod`（Tokyo）。ref：`nvjaljsvlkjskaoxponh` |
| Supabase Custom SMTP | 済・送信テストOK | smtp.gmail.com:465 / user info@ / from shift@ |
| Vercel プロジェクト | 済 | `dot-hotel-shift`（Hobby）。GitHub main を自動デプロイ |
| Vercel 環境変数 | 済 | 8つ＋`MAIL_FROM`・`APP_URL`（`https://dot-hotel-shift.vercel.app`）。後の2つは Production のみ |
| Supabase の URL 設定 | 済 | Site URL：`https://dot-hotel-shift.vercel.app`／Redirect：`/auth/callback` と `/**` |
| DB（001→002→003） | 未 | Claude Code のタスク1のあと、SQL Editor で実行 |
| Vercel 2段階認証 | 要確認 | 未設定なら 10/31 までに |
| Vercel Pro への切り替え | 運用開始前 | 会社利用のため |
