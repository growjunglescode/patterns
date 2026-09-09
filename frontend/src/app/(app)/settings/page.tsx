"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { InstitutionAutocomplete } from "@/components/InstitutionAutocomplete";
import { roleLabel } from "@/lib/roles";

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [bio, setBio] = useState("");
  const [orcid, setOrcid] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [studyCountry, setStudyCountry] = useState("");
  const [studyRegion, setStudyRegion] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.me().then((me) => {
      setUser(me);
      setDisplayName(me.display_name);
      setOrganization(me.organization || "");
      setBio(me.bio || "");
      setOrcid(me.orcid || "");
      setPhone(me.phone || "");
      setCountry(me.country || "");
      setCity(me.city || "");
      setStudyCountry(me.study_country || "");
      setStudyRegion(me.study_region || "");
      setShared(Boolean(me.profile_public));
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved("");
    try {
      const updated = await api.patchMe({
        display_name: displayName,
        organization,
        bio,
        orcid,
        phone,
        country,
        city,
        study_country: studyCountry,
        study_region: studyRegion,
        profile_public: shared,
      });
      setUser(updated);
      setSaved("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/p/${user?.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function logout() {
    api.logout();
    router.push("/login");
  }

  if (!user) return <p className="text-ink/40">Loading profile…</p>;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${user.id}` : `/p/${user.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={onSubmit} className="surface space-y-4 p-6">
        <p className="section-title">Your profile</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {saved && <p className="text-sm text-teal">{saved}</p>}
        <label className="block text-[13px]">
          Display name
          <input className="mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label className="block text-[13px]">
          Institution or project
          <InstitutionAutocomplete
            value={organization}
            onChange={setOrganization}
            onSelect={(row) => {
              if (row.country && !country.trim()) setCountry(row.country);
              if (row.city && !city.trim()) setCity(row.city);
            }}
            placeholder="Start typing a university or institution…"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[13px]">
            Phone
            <input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block text-[13px]">
            Country
            <input className="mt-1" value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
          <label className="block text-[13px]">
            City
            <input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="block text-[13px]">
            Camera trap country
            <input className="mt-1" value={studyCountry} onChange={(e) => setStudyCountry(e.target.value)} />
          </label>
        </div>
        <label className="block text-[13px]">
          Study area / region
          <input className="mt-1" value={studyRegion} onChange={(e) => setStudyRegion(e.target.value)} />
        </label>
        <label className="block text-[13px]">
          ORCID
          <input className="mt-1" value={orcid} onChange={(e) => setOrcid(e.target.value)} placeholder="0000-0000-0000-0000" />
        </label>
        <label className="block text-[13px]">
          Bio
          <textarea className="mt-1" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Field role, study area, or research focus." />
        </label>
        <button className="btn-forest">Save profile</button>
      </form>
      <aside className="space-y-4">
        <div className="surface p-6">
          <p className="section-title">Access</p>
          <p className="mt-3 font-medium">{roleLabel(user.role)}</p>
          <p className="mt-1 text-[13px] text-ink/55">{user.email}</p>
          <p className="mt-1 text-[13px] text-ink/55">{user.verified ? "Verified" : "Pending verification"} · {user.photo_count ?? 0} photos logged</p>
          <button type="button" onClick={logout} className="mt-4 text-[13px] font-semibold text-gold-deep">
            Sign out
          </button>
        </div>
        <div className="surface p-6">
          <p className="section-title">Share this profile</p>
          <p className="mt-2 text-[13px] text-ink/55">A public page with your name, institution, and role — never your email.</p>
          <label className="mt-4 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={shared}
              onChange={async (e) => {
                const next = e.target.checked;
                setShared(next);
                try {
                  await api.patchMe({ profile_public: next });
                } catch (err) {
                  setShared(!next);
                  setError(err instanceof Error ? err.message : "Could not update sharing");
                }
              }}
            />
            Make my profile public
          </label>
          <p className="mt-3 break-all font-mono text-[12px] text-ink/45">{shareUrl}</p>
          <button type="button" disabled={!shared} onClick={copyLink} className="btn-gold mt-3 disabled:opacity-40">
            {copied ? "Copied" : "Copy share link"}
          </button>
        </div>
      </aside>
    </div>
  );
}
