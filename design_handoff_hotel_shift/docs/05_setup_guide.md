# 環境の準備ガイド（Supabase・Vercel・Resend）

専門知識がなくても進められるように、画面でやることを順番に書いています。
**1つ終わるごとにチャットで知らせてください**。次の手順を一緒に確認します。

## 全体のつながり

```
スタッフ・管理者のスマホ／PC
        │  アプリを開く
        ▼
   Vercel（アプリを公開する場所）  ←── GitHub（コードの置き場所）に変更が入ると自動で更新
        │  データの読み書き・ログイン
        ▼
   Supabase（データベースとログイン）
        │  ログイン用リンクのメール
        ▼
   Resend（メールを送るサービス）
```

- **GitHub**：コードを保管する場所。用意済みです。
- **Vercel**：GitHub のコードを、インターネットで開けるアプリとして公開するサービスです。コードが更新されると自動で公開し直します。小規模なら無料プランで使えます。
- **Supabase**：データ（スタッフ・希望・シフト）とログインを管理します。用意済みです。
- **Resend**：メールを送るサービスです。ログイン用リンクや確定の通知に使います。

---

## ステップ1　Supabase：本番用プロジェクトを作る（10分）

1. https://supabase.com にログインし、「New project」を押す。
2. 次のように入力する。
   - Name：`hotel-shift-prod`
   - Database Password：「Generate a password」で作り、**必ず控えておく**
   - Region：**Northeast Asia (Tokyo)**
3. 作成が終わったら、左のメニューの「Project Settings」→「API」を開き、次の3つを控える（チャットには貼らないでください）。
   - Project URL
   - `anon` `public` のキー
   - `service_role` のキー（**秘密の鍵**です。他の人に見せないでください）

## ステップ2　Vercel：アプリを公開する（15分）

1. https://vercel.com を開き、「Sign Up」→「Continue with GitHub」で登録する。
2. 「Add New…」→「Project」を押し、`hotel-shift-manager` の「Import」を押す。
3. 「Environment Variables」に次を入れる（値はステップ1で控えたもの）。

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public のキー |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role のキー |

4. 「Deploy」を押す。数分で `https://hotel-shift-manager-xxxx.vercel.app` のようなURLができる。
5. そのURLを Supabase の「Authentication」→「URL Configuration」に登録する。
   - Site URL：上のURL
   - Redirect URLs：`上のURL/auth/callback`

この時点では、まだ古い画面が出ます。タスク1以降のコードが GitHub に入ると、自動で新しい画面に変わります。

## ステップ3-0　ドメインを用意する

### A0. Google Workspace のメールから送る（いちばん簡単・DNS作業なし）

Google Workspace をお使いなので、**Resend を使わずに Google の SMTP で送れます**（1日2,000通まで）。ログイン用リンクも確定の通知も、この方法で送ります。

1. 送信元のアドレスを決める。
   - おすすめ：管理者のアカウントに**エイリアス** `shift@dotincrecruit.com` を追加する（追加料金なし）。
   - Google 管理コンソール →「ユーザー」→ 管理者のアカウント →「ユーザー情報」→「メールエイリアス」に `shift` を追加します。
2. その管理者アカウントで、2段階認証をオンにする（https://myaccount.google.com/security）。
3. 同じページの「アプリ パスワード」で、名前を「シフト管理」としてパスワードを作り、16文字の値を控える。
4. Gmail の「設定」→「アカウント」→「他のメールアドレスを追加」で `shift@dotincrecruit.com` を追加し、送信元として選べるようにする。
5. Supabase の「Project Settings」→「Authentication」→「SMTP Settings」で、次を入れる。

| 項目 | 値 |
| --- | --- |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | 管理者のアカウントのメールアドレス |
| Password | アプリ パスワード（16文字） |
| Sender email | `shift@dotincrecruit.com` |
| Sender name | `シフト管理` |

6. Vercel の環境変数にも同じ値を入れる（アプリからの通知メール用）。

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | 管理者のアカウントのメールアドレス |
| `SMTP_PASS` | アプリ パスワード |
| `MAIL_FROM` | `シフト管理 <shift@dotincrecruit.com>` |
| `APP_URL` | Vercel のURL |

この方法なら、**ステップ3（Resend）は不要**です。管理者がパスワードを変えた場合や2段階認証を外した場合は、アプリ パスワードが無効になるので作り直してください。

### A. すでに持っているドメインを Resend で使う（将来、送信数が増えたら）

既存のメールに影響しないよう、**サブドメイン**（例：`shift.持っているドメイン`）を使います。

| 用途 | 使う名前 | DNSに追加するもの |
| --- | --- | --- |
| アプリのURL | `shift.持っているドメイン` | Vercel が表示する CNAME 1行 |
| メールの送信元 | `no-reply@shift.持っているドメイン` | Resend が表示する TXT・MX など3〜4行（すべて `shift` 付きの名前） |

- DNSは、ドメインを買ったサービスの管理画面で追加します。Google Workspace の申し込み時に買ったドメインは、多くの場合 Squarespace Domains（https://domains.squarespace.com 。Google アカウントでログイン）で管理されています。Google 管理コンソールの「ドメイン」→「ドメインの管理」でも確認できます。
- **既存の MX・TXT（`@` や名前なしの行）は変更・削除しないでください**。今の Gmail が届かなくなります。
- 使っているのが Google Workspace の場合は、その SMTP（`smtp.gmail.com`、1日2,000通まで）で送ることもできます。ただし、送信元が個人のアドレスになります。

### B. 新しくドメインを買う

**Vercel でドメインを買う方法をおすすめします**。DNSの設定も Vercel の画面だけで完結し、アプリのURLにも使えます。

1. Vercel のプロジェクト画面で「Settings」→「Domains」を開く。
2. 「Buy」から、使いたい名前を検索する（例：`〇〇-shift.com`。`.com` や `.jp` が無難）。
3. 購入すると、アプリが `https://〇〇-shift.com` で開けるようになる。
4. ステップ2の Supabase の URL Configuration を、新しいURLに書き換える。

メールの送信元は `no-reply@〇〇-shift.com` になります。

### ドメインの購入が間に合わない場合（つなぎの方法）

Gmail のアカウントから送る方法があります（1日500通まで。27名なら十分）。

1. シフト管理専用の Gmail アカウントを作る（例：`〇〇.shift@gmail.com`）。
2. Google アカウントで「2段階認証」をオンにし、「アプリ パスワード」を作る。
3. Supabase の SMTP Settings に、Host `smtp.gmail.com`、Port `465`、Username に Gmail アドレス、Password にアプリ パスワードを入れる。

ただし、迷惑メールに入りやすく、送信元も Gmail アドレスになります。運用が落ち着いたら、ドメインと Resend に切り替えてください。

## ステップ3　Resend：メールを送れるようにする（A0 を使う場合は不要）

1. https://resend.com で登録する。
2. 「Domains」→「Add Domain」で、送信元のドメインを入力する。
3. 表示されるDNSの設定（3〜4行）を、Vercel の「Settings」→「Domains」→ ドメイン名 →「DNS Records」に1行ずつ追加する（種類・名前・値をそのまま写す）。
4. Resend の画面で「Verified」になるまで待つ（数分〜数時間）。
5. 「API Keys」→「Create API Key」でキーを作り、Vercel の環境変数に追加する。

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | 作ったキー |
| `MAIL_FROM` | `シフト管理 <no-reply@shift.会社のドメイン>` |
| `APP_URL` | Vercel のURL |

6. Supabase の「Project Settings」→「Authentication」→「SMTP Settings」で「Enable Custom SMTP」をオンにし、次を入れる。

| 項目 | 値 |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend の API キー |
| Sender email | `no-reply@shift.会社のドメイン` |
| Sender name | `シフト管理` |

**ドメインがすぐに用意できない場合**：テスト中は、Resend に登録したメールアドレスにだけ送れます。管理者がひとりで動作を確認する分には足ります。スタッフ27名への案内（10/31予定）までに、ドメインを用意してください。

## ステップ4　データベースを作る（Claude Code と一緒に・10分）

タスク1で Claude Code が `003_v2_schema.sql` を用意したら、次のどちらかで本番用プロジェクトに流します。

- **かんたんな方法**：Supabase の「SQL Editor」を開き、`001` → `002` → `003` の順に中身を貼り付けて「Run」を押す。
- Supabase CLI を使う方法：Claude Code に「supabase CLI で本番に migrations を適用して」と依頼する。

流し終えたら「Table Editor」を開き、`facilities` に5施設が入っていることを確認します。

## ステップ5　最初の管理者を作る（5分）

1. Supabase の「Authentication」→「Users」→「Add user」→「Send invitation」で、管理者のメールアドレスを入力する。
2. 「SQL Editor」で次を実行する（メールアドレスは置き換えてください）。

```sql
update profiles set role = 'admin', email = '管理者のメールアドレス'
where id = (select id from auth.users where email = '管理者のメールアドレス');
```

3. 届いたメールのリンクからログインし、管理者の画面が出ることを確認する。

---

## 困ったときは

画面のスクリーンショットをチャットに貼ってください。**キーやパスワードは塗りつぶしてから**貼ってください。
