"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { InstitutionAutocomplete } from "@/components/InstitutionAutocomplete";
import { roleLabel } from "@/lib/roles";

type Affiliation = "university" | "institution" | "organization" | "hobby" | "";

const AFFILIATION_OPTIONS: { value: Exclude<Affiliation, "">; label: string }[] = [
  { value: "university", label: "University" },
  { value: "institution", label: "Institute" },
  { value: "organization", label: "Organization" },
  { value: "hobby", label: "Hobby / citizen scientist" },
];

function orgFieldCopy(affiliation: Affiliation) {
  if (affiliation === "university") {
    return { label: "University name", placeholder: "Start typing a university…" };
  }
  if (affiliation === "institution") {
    return { label: "Institute name", placeholder: "Start typing an institute or NGO…" };
  }
  if (affiliation === "organization") {
    return { label: "Organization name", placeholder: "Start typing an organization…" };
  }
  return {
    label: "University, institute, or organization",
    placeholder: "Start typing a university, institute, or organization…",
  };
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [affiliation, setAffiliation] = useState<Affiliation>("");
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
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setDisplayName(me.display_name);
        setAffiliation((me.affiliation_type as Affiliation) || "");
        setOrganization(me.organization || "");
        setBio(me.bio || "");
        setOrcid(me.orcid || "");
        setPhone(me.phone || "");
        setCountry(me.country || "");
        setCity(me.city || "");
        setStudyCountry(me.study_country || "");
        setStudyRegion(me.study_region || "");
        setShared(Boolean(me.profile_public));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved("");
    try {
      const updated = await api.patchMe({
        display_name: displayName,
        affiliation_type: affiliation || null,
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
      setAffiliation((updated.affiliation_type as Affiliation) || "");
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
    router.push("/");
  }

  if (loading) return <p className="text-ink/40">Loading profile…</p>;
  if (!user) {
    return (
      <div className="surface space-y-3 p-6">
        <p className="text-sm text-red-700">{error || "Could not load profile."}</p>
        <button type="button" className="btn-forest" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${user.id}` : `/p/${user.id}`;
  const orgCopy = orgFieldCopy(affiliation);
  const showOrgName = affiliation !== "hobby";

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
        <fieldset>
          <legend className="text-[13px]">Affiliation</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {AFFILIATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAffiliation(option.value)}
                className={`rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition ${
                  affiliation === option.value
                    ? "border-gold/50 bg-gold/10 text-ink"
                    : "border-ink/10 bg-paper text-ink/70 hover:border-ink/20"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {showOrgName && (
          <label className="block text-[13px]">
            {orgCopy.label}
            <InstitutionAutocomplete
              value={organization}
              affiliation={affiliation || undefined}
              onChange={setOrganization}
              onSelect={(row) => {
                if (row.country && !country.trim()) setCountry(row.country);
                if (row.city && !city.trim()) setCity(row.city);
              }}
              placeholder={orgCopy.placeholder}
            />
          </label>
        )}
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
          <p className="mt-1 text-[13px] text-ink/55">
            {user.verified ? "Verified" : "Pending verification"} · {user.photo_count ?? 0} photos logged
          </p>
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
