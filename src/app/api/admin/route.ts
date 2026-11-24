import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Nejsi přihlášen." }, { status: 401 });
  }

  const body = await req.text();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Nepodařilo se spojit s funkcí admin v Supabase." },
      { status: 502 }
    );
  }
}
