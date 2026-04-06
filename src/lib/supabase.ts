// src/lib/supabase.ts
// Supabaseクライアント（Phase 2の認証・DB連携で使用）
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** ブラウザ側クライアント（Client Componentsで使用） */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnon)
