import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import Link from "next/link";

const menus = [
  { href: "/admin/users", title: "회원 관리", desc: "회원 등급(free/paid)·권한(user/admin) 변경" },
  { href: "/admin/policies", title: "포인트 정책", desc: "지급 포인트 수치·활성화 여부 수정" },
  { href: "/admin/messages", title: "메시지 예약", desc: "1/3/7일 자동 메시지 예약 상태 조회" },
  { href: "/admin/consultations", title: "상담 예약", desc: "상담 예약 및 진행 상태 조회" },
  { href: "/admin/payments", title: "결제 내역", desc: "데모/실 결제 내역 조회" },
];

export default async function AdminHome() {
  await requireAdmin();

  return (
    <div>
      <PageHeader title="관리자" desc="회원·포인트·메시지·상담·결제를 관리합니다." />
      <div className="grid gap-4 sm:grid-cols-2">
        {menus.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="transition hover:border-blue-300 hover:shadow-md">
              <h3 className="font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
