import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ftunhntfrpyoxxuieisz.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_J0oJsHQyukk2mBkz6onCSQ_Xx-ADK-a";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function getMyUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error("Nejsi přihlášen.");
  }
  return session.user.id;
}
