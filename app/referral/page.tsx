import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { Card, PageHeader } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import type { ReferralCode } from "@/lib/types";

async function getOrCreateCode(userId: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("referral_codes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return (data as ReferralCode).code;

  // 트리거 이전에 만들어진 계정 등 코드가 없으면 서버에서 발급한다.
  const admin = createAdminSupabase();
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const { data: created } = await admin
    .from("referral_codes")
    .insert({ user_id: userId, code })
    .select()
    .single();
  return (created as ReferralCode | null)?.code ?? null;
}

export default async function ReferralPage() {
  const profile = await requireUser();
  const code = await getOrCreateCode(profile.id);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = code ? `${siteUrl}/login?ref=${code}` : "";

  return (
    <div>
      <PageHeader
        title="추천하기"
        desc="친구가 내 추천 코드로 가입하면 두 사람 모두 포인트를 받아요."
      />

      <Card className="mb-4">
        <p className="text-sm font-semibold text-slate-500">내 추천 코드</p>
        <div className="mt-2 flex items-center gap-3">
          <code className="rounded-lg bg-slate-100 px-4 py-2 text-lg font-bold tracking-widest text-blue-700">
            {code ?? "발급 중..."}
          </code>
          {code && <CopyButton value={code} label="코드 복사" />}
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-slate-500">추천 링크</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            readOnly
            value={link}
            className="w-full flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
          />
          {link && <CopyButton value={link} label="링크 복사" />}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          이 링크로 가입한 사용자와 나에게 각각 포인트가 지급됩니다.
        </p>
      </Card>
    </div>
  );
}
