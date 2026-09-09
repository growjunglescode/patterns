"use client";

import { PERMISSIONS, ROLE_OPTIONS, roleLabel } from "@/lib/roles";

export default function PermissionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="section-title">Permissions</p>
        <p className="mt-1 text-[0.9375rem] text-ink/55">
          What each role can do in this workspace. Scientists at institutions get the research tools; citizen scientists contribute photos.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10">
              <th className="px-5 py-3">Capability</th>
              {ROLE_OPTIONS.map((role) => (
                <th key={role} className="px-3 py-3 text-center">
                  {roleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((row) => (
              <tr key={row.key} className="border-t border-ink/5">
                <td className="px-5 py-3">
                  <p className="font-medium">{row.label}</p>
                  {row.note && <p className="text-[12.5px] text-ink/45">{row.note}</p>}
                </td>
                {ROLE_OPTIONS.map((role) => (
                  <td key={role} className="px-3 py-3 text-center">
                    {row.roles[role] ? <span className="text-teal">●</span> : <span className="text-ink/20">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
