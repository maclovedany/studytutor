import { ButtonLink, Card } from "@/components/ui";
import { siteConfig } from "@/lib/site-config";

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero — 움직이는 오로라 배경 */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-100 px-6 py-20 text-center sm:px-12">
        {/* 배경 레이어 */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* 천천히 흐르는 그라데이션 */}
          <div className="animate-hero-pan absolute inset-0 bg-[linear-gradient(120deg,#eff6ff_0%,#ffffff_40%,#eef2ff_70%,#f0f9ff_100%)]" />
          {/* 떠다니는 블롭들 */}
          <div className="animate-blob absolute -left-16 -top-12 h-72 w-72 rounded-full bg-blue-400/30 blur-3xl" />
          <div className="animate-blob blob-delay-1 absolute -right-12 top-6 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl" />
          <div className="animate-blob blob-delay-2 absolute -bottom-16 left-1/3 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl" />
        </div>

        {/* 내용 */}
        <div className="relative z-10">
          <span className="inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-700 backdrop-blur-sm">
            전문가 1:1 코칭 · {siteConfig.serviceNameEn}
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-600">
            {siteConfig.subCopy}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/consultations" className="px-6 py-3 text-base">
              {siteConfig.ctaLabel}
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" className="px-6 py-3 text-base">
              로그인 / 회원가입
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="grid gap-4 sm:grid-cols-3">
        {siteConfig.valueProps.map((v, i) => (
          <Card key={v.title}>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white">
              {i + 1}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{v.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.desc}</p>
          </Card>
        ))}
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold text-slate-900">이렇게 진행돼요</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-4">
          {[
            "회원가입하고 포인트 받기",
            "휴대폰 인증으로 신뢰 확보",
            "상담 예약 후 15분 무료 상담",
            "만족하면 결제하고 계속하기",
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
