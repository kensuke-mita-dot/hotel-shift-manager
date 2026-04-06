import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function Home() {
  // Supabase が未設定（ビルド時など）はそのまま admin/daily へ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/admin/daily");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile?.role === "admin" ? "/admin/daily" : "/staff/wishes");
}
