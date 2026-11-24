import { NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

export async function GET() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    return NextResponse.json({ ok: res.ok, status: res.status, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
