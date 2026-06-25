"use client";

import { useState } from "react";
import { Button } from "./ui";

export default function CopyButton({
  value,
  label = "복사",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 무시
    }
  }

  return (
    <Button variant={copied ? "primary" : "secondary"} onClick={copy} type="button">
      {copied ? "복사됨!" : label}
    </Button>
  );
}
