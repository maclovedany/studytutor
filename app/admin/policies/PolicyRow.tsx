"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PointPolicy } from "@/lib/types";

export default function PolicyRow({ policy }: { policy: PointPolicy }) {
  const router = useRouter();
  const [name, setName] = useState(policy.name);
  const [points, setPoints] = useState(String(policy.points));
  const [isActive, setIsActive] = useState(policy.is_active);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== policy.name ||
    points !== String(policy.points) ||
    isActive !== policy.is_active;

  async function save() {
    setSaving(true);
    await fetch("/api/admin/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy_key: policy.policy_key,
        name,
        points: Number(points),
        is_active: isActive,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-slate-100 text-sm">
      <td className="py-2 pr-3 font-mono text-xs text-slate-500">
        {policy.policy_key}
      </td>
      <td className="py-2 pr-3">
        <input
          className="w-32 rounded-lg border border-slate-300 px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="number"
          min={0}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <label className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          활성
        </label>
      </td>
      <td className="py-2 text-right">
        <button
          disabled={!dirty || saving}
          onClick={save}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
        >
          {saving ? "저장 중" : "저장"}
        </button>
      </td>
    </tr>
  );
}
