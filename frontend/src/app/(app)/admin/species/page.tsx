"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AdminSpeciesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api.adminSpecies().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Could not load species"));
  }
  useEffect(load, []);

  async function patch(id: string, body: object) {
    setBusy(id);
    setError("");
    try {
      const updated = await api.adminPatchSpecies(id, body);
      setRows((list) => list.map((row) => (row.id === id ? { ...row, ...updated } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update species");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[0.9375rem] text-[var(--muted)]">
        Deployed species are the ones the matcher treats as identifiable. Jaguar is the first profile; others can be
        staged without opening them to matching.
      </p>
      {error && <p className="text-sm text-[var(--signal-warn)]">{error}</p>}
      <div className="surface overflow-hidden">
        <div className="table-scroll">
          <table className="w-full min-w-[48rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-5 py-2">Species</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Flank required</th>
                <th className="px-3 py-2">Deployed</th>
                <th className="px-3 py-2">IDs</th>
                <th className="px-3 py-2">Photos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--line)]">
                  <td className="px-5 py-3">
                    <p className="font-medium">{row.common_name}</p>
                    <p className="text-[12px] italic text-[var(--muted)]">{row.scientific_name || row.slug}</p>
                  </td>
                  <td className="px-3 py-3 font-mono">{row.id_prefix}</td>
                  <td className="px-3 py-3">{row.pattern_bearing ? "Coat-bearing" : "Not patterned"}</td>
                  <td className="px-3 py-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(row.flank_required)}
                        disabled={busy === row.id}
                        onChange={(e) => patch(row.id, { flank_required: e.target.checked })}
                      />
                      {row.flank_required ? "Yes" : "No"}
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(row.deployed)}
                        disabled={busy === row.id}
                        onChange={(e) => patch(row.id, { deployed: e.target.checked })}
                      />
                      {row.deployed ? "Live" : "Staged"}
                    </label>
                  </td>
                  <td className="px-3 py-3 font-mono">{row.individual_count}</td>
                  <td className="px-3 py-3 font-mono">{row.detection_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
