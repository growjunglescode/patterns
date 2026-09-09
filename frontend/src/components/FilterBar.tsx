import { ReactNode } from "react";

export type FilterOption = string | { value: string; label: string };

function optionValue(opt: FilterOption) {
  return typeof opt === "string" ? opt : opt.value;
}

function optionLabel(opt: FilterOption) {
  return typeof opt === "string" ? opt : opt.label;
}

export function FilterBar({
  query,
  onQuery,
  placeholder = "Filter this table…",
  showing,
  total,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  showing: number;
  total: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full sm:max-w-xs"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      <p className="text-[12.5px] tabular-nums text-ink/40 sm:ml-auto">
        {showing} of {total}
      </p>
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: FilterOption[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 sm:w-auto sm:min-w-[8.5rem]">
      <option value="">{label}</option>
      {options.map((opt) => {
        const v = optionValue(opt);
        return (
          <option key={v} value={v}>
            {optionLabel(opt)}
          </option>
        );
      })}
    </select>
  );
}
