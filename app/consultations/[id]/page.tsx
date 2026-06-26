import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { Consultation } from "@/lib/types";
import Room from "./Room";

export default async function ConsultationRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("consultations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const consultation = data as Consultation | null;
  if (!consultation || consultation.user_id !== profile.id) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="상담 진행" desc="15분 무료 상담 후 결제로 이어집니다." />
      <Room consultation={consultation} tier={profile.tier} />
    </div>
  );
}
