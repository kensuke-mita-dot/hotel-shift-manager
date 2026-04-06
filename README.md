# Hotel Shift Management System

ホテル特化型シフト管理ツール（MVP）

## 技術スタック

- **Next.js 14** (App Router)
- **Tailwind CSS**
- **shadcn/ui**
- **Supabase** (Auth + PostgreSQL + RLS)
- **date-fns** (日付操作)
- **Lucide React** (アイコン)

---

## セットアップ手順

### 1. プロジェクト作成

```bash
# 既存リポジトリをクローン or 新規作成
npx create-next-app@latest hotel-shift \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd hotel-shift
```

### 2. 依存パッケージのインストール

```bash
# Supabase クライアント
npm install @supabase/supabase-js @supabase/ssr

# shadcn/ui 初期化（対話形式）
npx shadcn@latest init
# ↑ ここで "New York" スタイル、TypeScript: Yes を選択推奨

# shadcn コンポーネント追加
npx shadcn@latest add button badge toast sonner

# 日付操作
npm install date-fns

# アイコン（Next.js プロジェクトに既に含まれていることが多い）
npm install lucide-react
```

### 3. Supabase プロジェクト作成

1. [https://supabase.com](https://supabase.com) にアクセスしてプロジェクトを作成
2. **SQL Editor** を開き、`supabase/migrations/001_initial_schema.sql` の内容を全コピペして実行
3. プロジェクトの **Settings → API** から以下を取得：
   - `Project URL`
   - `anon public key`

### 4. 環境変数の設定

```bash
# .env.local を作成
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxx...
EOF
```

### 5. ローカル起動

```bash
npm run dev
# → http://localhost:3000 で起動
```

---

## ディレクトリ構成

```
src/
├── app/
│   ├── admin/
│   │   ├── daily/       # 管理者：日次調整画面
│   │   │   └── page.tsx
│   │   └── monthly/     # 管理者：月次マトリックス
│   │       └── page.tsx
│   ├── staff/
│   │   └── wishes/      # スタッフ：希望入力
│   │       └── page.tsx
│   └── api/
│       ├── shifts/
│       │   ├── route.ts            # シフトCRUD
│       │   └── ai-draft/route.ts   # AI自動生成
│       └── wishes/
│           └── route.ts
├── components/
│   ├── admin/
│   │   ├── SlotDropZone.tsx   # D&Dスロット
│   │   ├── StaffPool.tsx      # 未配置プール
│   │   └── MonthlyMatrix.tsx  # 月次俯瞰表
│   └── staff/
│       └── WishInputGrid.tsx  # 希望入力グリッド
├── lib/
│   ├── supabase.ts    # Supabaseクライアント
│   └── validation.ts  # NGパターン検証
└── types/
    └── index.ts       # 共通型定義
```

---

## 開発フェーズ計画

### Phase 1（MVP） ✅ 現在地
- [x] DB設計（SQL）
- [x] 型定義
- [x] 管理者：日次調整画面（D&D）
- [x] 管理者：月次マトリックス（警告表示）
- [x] スタッフ：希望入力グリッド

### Phase 2（認証・永続化）
- [ ] Supabase Auth ログイン（メール/パスワード）
- [ ] ミドルウェアでのロール別ルーティング
- [ ] Supabase からのデータ取得・保存

### Phase 3（AI自動生成）
- [ ] Gemini API 連携
- [ ] プロンプトチューニング
- [ ] AI下書きレビューUI

---

## NGパターンの検証ロジック

`src/lib/validation.ts` の `validateDayAssignment()` が中心。

```
夜勤（22:00-08:00）→ 翌朝勤（08:00-16:00）は絶対禁止
```

DBレベルでも `v_monthly_shift_summary` ビューで `has_ng_pattern` フラグを持ちます。

---

## AI自動生成の設計思想

`shifts` テーブルの以下フィールドでAI生成分を管理：

| フィールド    | 説明                          |
|-------------|-------------------------------|
| `ai_suggested` | AIが提案したシフトか否か    |
| `ai_model`     | 使用モデル名（例: gemini-1.5-pro） |
| `ai_run_id`    | バッチ実行の追跡ID          |
| `is_confirmed` | 管理者が承認したか否か      |

AI生成の下書きは `is_confirmed = false` で保存され、管理者が確認・調整後に `true` にします。
