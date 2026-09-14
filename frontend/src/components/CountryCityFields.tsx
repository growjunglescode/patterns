"use client";

import { ensureCityOption, ensureCountryOption, citiesForCountry } from "@/lib/geo";

type Props = {
  country: string;
  city: string;
  onCountry: (value: string) => void;
  onCity: (value: string) => void;
  countryLabel?: string;
  cityLabel?: string;
  required?: boolean;
  tone?: "light" | "dark";
  className?: string;
};

export function CountryCityFields({
  country,
  city,
  onCountry,
  onCity,
  countryLabel = "Country",
  cityLabel = "City / town",
  required = false,
  tone = "light",
  className = "",
}: Props) {
  const countries = ensureCountryOption(country);
  const presetCities = citiesForCountry(country);
  const cityOptions = ensureCityOption(country, city);
  const cityIsCustom = Boolean(city) && !presetCities.includes(city);
  const selectValue = !city ? "" : cityIsCustom ? "__other__" : city;

  const labelClass = tone === "dark" ? "block text-[13px] text-[#8a9a92]" : "block text-[13px]";

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`.trim()}>
      <label className={labelClass}>
        {countryLabel}
        <select
          className="mt-1 w-full"
          value={country}
          required={required}
          onChange={(e) => {
            onCountry(e.target.value);
            onCity("");
          }}
        >
          <option value="">Select a country…</option>
          {countries.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {cityLabel}
        <select
          className="mt-1 w-full"
          value={selectValue}
          disabled={!country}
          onChange={(e) => {
            if (e.target.value === "__other__") {
              onCity(cityIsCustom ? city : "");
              return;
            }
            onCity(e.target.value);
          }}
        >
          <option value="">{country ? "Select a city…" : "Choose a country first"}</option>
          {cityOptions
            .filter((name) => presetCities.includes(name) || name === city)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          <option value="__other__">Other…</option>
        </select>
        {(selectValue === "__other__" || cityIsCustom) && (
          <input
            className="mt-2 w-full"
            value={city}
            onChange={(e) => onCity(e.target.value)}
            placeholder="Type your city or town"
            required={required}
          />
        )}
      </label>
    </div>
  );
}

export function CountrySelect({
  value,
  onChange,
  label = "Country",
  required = false,
  tone = "light",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  tone?: "light" | "dark";
}) {
  const countries = ensureCountryOption(value);
  const labelClass = tone === "dark" ? "block text-[13px] text-[#8a9a92]" : "block text-[13px]";
  return (
    <label className={labelClass}>
      {label}
      <select
        className="mt-1 w-full"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select a country…</option>
        {countries.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
