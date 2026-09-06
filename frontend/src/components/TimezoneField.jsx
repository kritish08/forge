import { useMemo, useState } from "react";
import { deviceTimeZone } from "../utils/date";

/**
 * Timezone picker.
 *
 * This was `Intl.supportedValuesOf('timeZone')` mapped straight to <option>
 * elements — around 400 of them, re-rendered on every Settings render, with no
 * search. Finding "Asia/Kolkata" meant scrolling a native picker through hundreds
 * of raw IANA strings.
 *
 * Now: the detected zone is offered first (it is the right answer almost every
 * time), and the full list is searchable and grouped by region, with the current
 * UTC offset shown so you can confirm you picked the right one.
 */

/**
 * IANA renamed a number of zones, and browsers disagree about which name they
 * expose. Chromium still lists Asia/Calcutta, not Asia/Kolkata — so a user in
 * India searching for their own city by its actual name found nothing. Matching
 * both directions fixes that whichever name a given engine happens to ship.
 */
export const ALIASES = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho Chi Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Buenos_Aires": "America/Argentina/Buenos Aires",
  "Asia/Chungking": "Asia/Chongqing",
};
// Both directions, so either spelling matches whichever the engine lists.
const ALIAS_INDEX = Object.entries(ALIASES).reduce((acc, [legacy, modern]) => {
  acc[legacy] = modern;
  acc[modern.replace(/ /g, "_")] = legacy;
  return acc;
}, {});

export function allZones() {
  let zones;
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = ["UTC"];
  }
  // The engine's own resolved zone is not guaranteed to appear in that list —
  // Chromium reports UTC from resolvedOptions() while omitting it here — so the
  // user's current zone could be missing from the picker entirely.
  const device = deviceTimeZone();
  if (device && !zones.includes(device)) zones = [device, ...zones];
  return zones;
}

/** The searchable haystack for a zone: its own name plus any alias. */
export function searchTextFor(zone) {
  const alias = ALIAS_INDEX[zone];
  return (alias ? `${zone} ${alias}` : zone).toLowerCase().replace(/_/g, " ");
}

/** e.g. "GMT+5:30" for a zone, right now. */
function offsetLabel(zone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

const pretty = (zone) => zone.split("/").pop().replace(/_/g, " ");

export default function TimezoneField({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const zones = useMemo(allZones, []);
  const detected = useMemo(deviceTimeZone, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? zones.filter((z) => searchTextFor(z).includes(q)) : zones;
    return list.slice(0, 60);
  }, [query, zones]);

  const grouped = useMemo(() => {
    const out = new Map();
    for (const z of matches) {
      const region = z.includes("/") ? z.split("/")[0] : "Other";
      if (!out.has(region)) out.set(region, []);
      out.get(region).push(z);
    }
    return [...out.entries()];
  }, [matches]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunk px-3.5 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] text-ink">{pretty(value || "UTC")}</p>
          <p className="truncate text-xs text-ink-subtle">{value || "UTC"} · {offsetLabel(value || "UTC")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setQuery(""); }}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-accent-bold transition-colors active:bg-surface-raised"
        >
          {open ? "Done" : "Change"}
        </button>
      </div>

      {value !== detected && !open && (
        <button
          type="button"
          onClick={() => onChange(detected)}
          className="mt-2 w-full rounded-xl border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-left text-[13px] text-ink-muted transition-transform active:scale-[0.99]"
        >
          This device says <span className="font-semibold text-accent-bold">{pretty(detected)}</span>.
          Tap to use it.
        </button>
      )}

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-line">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cities or regions"
            aria-label="Search timezones"
            className="w-full border-b border-line bg-surface-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <div className="max-h-64 overflow-y-auto overscroll-contain bg-surface-raised">
            {grouped.length === 0 && (
              <p className="px-3.5 py-6 text-center text-sm text-ink-subtle">
                Nothing matches “{query}”.
              </p>
            )}
            {grouped.map(([region, list]) => (
              <div key={region}>
                <p className="sticky top-0 bg-surface-sunk px-3.5 py-1.5 text-[11px] font-semibold text-ink-muted">
                  {region.replace(/_/g, " ")}
                </p>
                {list.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => { onChange(z); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-surface-sunk ${
                      z === value ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {pretty(z)}
                      {/* When the engine lists a zone under its old name, show the
                          current one too so it is recognisable. */}
                      {ALIASES[z] && (
                        <span className="ml-1.5 text-ink-subtle">· {pretty(ALIASES[z])}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-subtle">{offsetLabel(z)}</span>
                  </button>
                ))}
              </div>
            ))}
            {matches.length === 60 && (
              <p className="px-3.5 py-2.5 text-center text-xs text-ink-subtle">
                Showing the first 60 — keep typing to narrow it down.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
