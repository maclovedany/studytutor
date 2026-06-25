"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, Role, Tier } from "@/lib/types";

export default function UserRow({ user }: { user: Profile }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [tier, setTier] = useState<Tier>(user.tier);
  const [saving, setSaving] = useState(false);
  const dirty = role !== user.role || tier !== user.tier;

  async function save() {
    setSaving(true);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, role, tier }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-slate-100 text-sm">
      <td className="py-2 pr-3">
        <div className="font-medium text-slate-800">
          {user.display_name ?? "-"}
        </div>
        <div className="text-xs text-slate-400">{user.email}</div>
      </td>
      <td className="py-2 pr-3">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1"
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
        >
          <option value="free">free</option>
          <option value="paid">paid</option>
        </select>
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
