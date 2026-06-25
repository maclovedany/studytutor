import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assertAdminRequest, parseUserPatch } from "@/lib/admin-guard";

/** 회원 role/tier 변경 (admin 전용) */
export async function PATCH(request: Request) {
  const serverDb = await createServerSupabase();
  try {
    await assertAdminRequest(serverDb);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "forbidden";
    return NextResponse.json({ error: msg }, { status: msg === "unauthorized" ? 401 : 403 });
  }

  let patch;
  try {
    patch = parseUserPatch(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "bad request" },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();
  const { id, ...fields } = patch;
  const { error } = await admin.from("profiles").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
