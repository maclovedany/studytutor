"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function PhoneVerify() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setMsg(null);
    setLoading(true);
    const res = await fetch("/api/phone/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setMsg(data.error ?? "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setSent(true);
    setDevCode(data.devCode ?? null);
  }

  async function verify() {
    setMsg(null);
    setLoading(true);
    const res = await fetch("/api/phone/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setMsg(data.error ?? "인증에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="휴대폰 번호 (예: 010-1234-5678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={sent}
        />
        <Button onClick={send} disabled={loading || sent || !phone} variant="secondary">
          {sent ? "전송됨" : "인증번호 전송"}
        </Button>
      </div>

      {sent && (
        <>
          {devCode && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              개발 모드 인증번호: <b className="tracking-widest">{devCode}</b>{" "}
              (실서비스에서는 SMS로 발송됩니다)
            </p>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="인증번호 6자리"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
            />
            <Button onClick={verify} disabled={loading || code.length < 6}>
              인증 확인
            </Button>
          </div>
        </>
      )}

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
