"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CoatPrint, Grain, Wordmark } from "@/components/Brand";
import { InstitutionAutocomplete } from "@/components/InstitutionAutocomplete";
import { api, type User } from "@/lib/api";
import { writeProjectId } from "@/lib/project";

type Affiliation = "university" | "institution" | "hobby" | "";

type StationDraft = { name: string; code: string };

const STEPS = ["Affiliation", "Contact", "Study area", "Camera traps"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [affiliation, setAffiliation] = useState<Affiliation>("");
  const [organization, setOrganization] = useState("");
  const [projectName, setProjectName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [studyCountry, setStudyCountry] = useState("");
  const [studyRegion, setStudyRegion] = useState("");
  const [bio, setBio] = useState("");
  const [stations, setStations] = useState<StationDraft[]>([{ name: "", code: "" }]);

  const needsTraps = affiliation === "university" || affiliation === "institution";

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (me.onboarding_complete) {
          router.replace("/overview");
          return;
        }
        setUser(me);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  function updateStation(index: number, patch: Partial<StationDraft>) {
    setStations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function canContinue() {
    if (step === 0) {
      if (!affiliation) return false;
      if (needsTraps && !organization.trim()) return false;
      return true;
    }
    if (step === 1) return Boolean(country.trim());
    if (step === 2) {
      if (!needsTraps) return true;
      return Boolean(studyCountry.trim());
    }
    if (step === 3) {
      const named = stations.filter((s) => s.name.trim());
      if (needsTraps) return named.length > 0;
      return true;
    }
    return true;
  }

  async function finish(e?: FormEvent) {
    e?.preventDefault();
    if (!canContinue()) return;
    setBusy(true);
    setError("");
    try {
      const named = stations
        .map((s) => ({ name: s.name.trim(), code: s.code.trim() || undefined }))
        .filter((s) => s.name);
      const updated = await api.completeOnboarding({
        affiliation_type: affiliation,
        organization: organization.trim() || null,
        phone: phone.trim() || null,
        country: country.trim(),
        city: city.trim() || null,
        study_country: studyCountry.trim() || null,
        study_region: studyRegion.trim() || null,
        project_name: projectName.trim() || null,
        bio: bio.trim() || null,
        stations: named,
      });
      if (updated.home_project_id) writeProjectId(updated.home_project_id);
      router.replace("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070a09] text-[#8a9a92]">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#070a09] text-[#e6ede8]">
      <CoatPrint tone="dark" strength="soft" />
      <Grain />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex items-center justify-between gap-3 sm:mb-10">
          <Wordmark light />
          <p className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[#8a9a92] sm:text-[12px]">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>

        <div className="mb-6 h-1 overflow-hidden rounded-full bg-[#2a3832] sm:mb-8">
          <div className="h-full bg-[#c4a35a] transition-all" style={{ width: `${progress}%` }} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length - 1) {
              if (canContinue()) setStep((s) => s + 1);
              return;
            }
            void finish(e);
          }}
          className="mb-8 space-y-6 rounded-[1.2rem] border border-[#2a3832] bg-[#101614] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-7"
        >
          <div>
            <p className="page-kicker !text-[#c4a35a]">Field profile</p>
            <h1 className="mt-2 font-display text-[1.75rem] font-semibold tracking-tight text-[#e6ede8] sm:text-3xl">
              {STEPS[step]}
            </h1>
            <p className="mt-2 text-[0.95rem] text-[#8a9a92]">
              {step === 0 && "How do you work with wildlife photos?"}
              {step === 1 && "How should the catalog reach you?"}
              {step === 2 && "Where are the cameras you monitor?"}
              {step === 3 && "Name the camera traps you will upload from."}
            </p>
          </div>

          {error && <p className="text-sm text-[#c45c2a]">{error}</p>}

          {step === 0 && (
            <div className="space-y-4">
              <div className="grid gap-3">
                {(
                  [
                    ["university", "University / research lab", "Academic fieldwork and publications"],
                    ["institution", "Institution / NGO", "Conservation or government program"],
                    ["hobby", "Hobby / citizen scientist", "Personal uploads and learning"],
                  ] as const
                ).map(([value, label, note]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAffiliation(value)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      affiliation === value
                        ? "border-[#c4a35a]/55 bg-[#c4a35a]/10"
                        : "border-[#2a3832] bg-[#070a09]/40 hover:border-[#3d4f47]"
                    }`}
                  >
                    <p className="font-medium text-[#e6ede8]">{label}</p>
                    <p className="mt-1 text-[13px] text-[#8a9a92]">{note}</p>
                  </button>
                ))}
              </div>
              {needsTraps && (
                <>
                  <label className="block text-[13px] text-[#8a9a92]">
                    University or institution name
                    <InstitutionAutocomplete
                      value={organization}
                      required
                      affiliation={affiliation}
                      placeholder={
                        affiliation === "university"
                          ? "Start typing a university…"
                          : "Start typing an institution or NGO…"
                      }
                      onChange={setOrganization}
                      onSelect={(row) => {
                        if (row.country && !country.trim()) setCountry(row.country);
                        if (row.city && !city.trim()) setCity(row.city);
                      }}
                    />
                  </label>
                  <label className="block text-[13px] text-[#8a9a92]">
                    Project or study name (optional)
                    <input
                      className="mt-1 w-full"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Amazon Basin Project"
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className="block text-[13px] text-[#8a9a92]">
                Email
                <input className="mt-1 w-full opacity-70" value={user.email} readOnly />
              </label>
              <label className="block text-[13px] text-[#8a9a92]">
                Best contact number
                <input
                  className="mt-1 w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+506 …"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[13px] text-[#8a9a92]">
                  Country where you are based
                  <input
                    className="mt-1 w-full"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Costa Rica"
                    required
                  />
                </label>
                <label className="block text-[13px] text-[#8a9a92]">
                  City / town
                  <input
                    className="mt-1 w-full"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Puerto Jiménez"
                  />
                </label>
              </div>
              <label className="block text-[13px] text-[#8a9a92]">
                Anything else we should know (optional)
                <textarea
                  className="mt-1 w-full"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Species focus, collaborators, field season…"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {needsTraps ? (
                <>
                  <label className="block text-[13px] text-[#8a9a92]">
                    Country of your camera traps
                    <input
                      className="mt-1 w-full"
                      value={studyCountry}
                      onChange={(e) => setStudyCountry(e.target.value)}
                      placeholder="Costa Rica"
                      required
                    />
                  </label>
                  <label className="block text-[13px] text-[#8a9a92]">
                    Region / park / study area
                    <input
                      className="mt-1 w-full"
                      value={studyRegion}
                      onChange={(e) => setStudyRegion(e.target.value)}
                      placeholder="e.g. Amazon Basin"
                    />
                  </label>
                </>
              ) : (
                <p className="text-[0.95rem] text-[#8a9a92]">
                  Optional for hobby accounts. You can still name cameras on the next step, or skip and upload
                  from a default field station.
                </p>
              )}
              {!needsTraps && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-[13px] text-[#8a9a92]">
                    Camera trap country (optional)
                    <input
                      className="mt-1 w-full"
                      value={studyCountry}
                      onChange={(e) => setStudyCountry(e.target.value)}
                    />
                  </label>
                  <label className="block text-[13px] text-[#8a9a92]">
                    Area (optional)
                    <input
                      className="mt-1 w-full"
                      value={studyRegion}
                      onChange={(e) => setStudyRegion(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[13px] text-[#8a9a92]">
                These names appear in the upload form. You can add more later from research tools.
              </p>
              {stations.map((station, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_auto]">
                  <input
                    value={station.name}
                    onChange={(e) => updateStation(index, { name: e.target.value })}
                    placeholder={`Camera trap ${index + 1} name`}
                    required={needsTraps && index === 0}
                  />
                  <input
                    value={station.code}
                    onChange={(e) => updateStation(index, { code: e.target.value })}
                    placeholder="Code (optional)"
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[#2a3832] px-3 text-[13px] text-[#8a9a92] disabled:opacity-30"
                    disabled={stations.length === 1}
                    onClick={() => setStations((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-[13px] font-semibold text-[#c4a35a]"
                onClick={() => setStations((rows) => [...rows, { name: "", code: "" }])}
              >
                + Add another camera trap
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              className="text-[13px] font-semibold text-[#8a9a92] disabled:opacity-30"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            <button type="submit" disabled={!canContinue() || busy} className="btn-gold disabled:opacity-40">
              {busy ? "Saving…" : step === STEPS.length - 1 ? "Open my catalog" : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
