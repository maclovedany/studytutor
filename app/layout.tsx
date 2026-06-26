import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SetupBanner from "@/components/SetupBanner";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `${siteConfig.serviceName} — ${siteConfig.tagline}`,
  description: siteConfig.subCopy,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      {/* 일부 브라우저 확장(예: ColorZilla)이 <body>에 cz-shortcut-listen 등
          속성을 주입해 하이드레이션 경고가 발생하므로 이 엘리먼트만 억제 */}
      <body className="min-h-full" suppressHydrationWarning>
        <SetupBanner />
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
