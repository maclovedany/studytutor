"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function ReserveButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reserve() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/consultations", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "예약 실패");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button onClick={reserve} disabled={disabled || loading}>
        {loading ? "예약 중..." : "새 상담 예약하기"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
