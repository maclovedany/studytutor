import Link from "next/link";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { Badge } from "./ui";

export default async function Nav() {
  const profile = await getSessionProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-700">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-sm text-white">
            코
          </span>
          {siteConfig.serviceName}
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {profile ? (
            <>
              <Link className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="/consultations">
                상담
              </Link>
              <Link className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="/points">
                포인트
              </Link>
              <Link className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="/referral">
                추천
              </Link>
              <Link className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="/mypage">
                마이페이지
              </Link>
              {isAdmin(profile) && (
                <Link
                  className="rounded-lg px-3 py-2 font-medium text-blue-700 hover:bg-blue-50"
                  href="/admin"
                >
                  관리자
                </Link>
              )}
              <span className="ml-2 hidden items-center gap-1 sm:flex">
                <Badge tone={profile.tier === "paid" ? "green" : "slate"}>
                  {profile.tier === "paid" ? "유료" : "무료"}
                </Badge>
              </span>
              <form action="/auth/signout" method="post">
                <button className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              href="/login"
            >
              로그인
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
