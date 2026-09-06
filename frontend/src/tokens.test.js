import fs from "node:fs";
import path from "node:path";

/**
 * Guards the semantic token layer.
 *
 * Two failure modes this catches, both of which happened during the migration
 * and both of which fail SILENTLY in the browser — Tailwind simply generates
 * nothing for an unknown class, so the element loses its colour with no error:
 *
 *   1. A malformed token name. Bulk-replacing `bg-orange-50` -> `bg-accent-soft`
 *      also matched inside `bg-orange-500`, leaving `bg-accent-soft0` on 24
 *      elements, including the notification toggles.
 *   2. A raw palette step creeping back in. Those are what left ~40 colours
 *      without a dark variant in the first place.
 */

const SRC = path.join(process.cwd(), "src");
const VALID = {
  surface: ["", "raised", "sunk"],
  line: ["", "strong"],
  ink: ["", "muted", "subtle"],
  accent: ["", "bold", "soft", "contrast"],
  success: ["", "soft"],
  warning: ["", "soft"],
  danger: ["", "soft"],
};

function sources(dir = SRC, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.jsx?$/.test(entry.name) && !entry.name.endsWith(".test.js")) {
      acc.push([path.relative(SRC, full), fs.readFileSync(full, "utf8")]);
    }
  }
  return acc;
}

const FILES = sources();
const PREFIX = "(?:bg|text|border|ring|divide|fill|stroke|from|to|via)";

describe("semantic tokens", () => {
  test("no malformed token names", () => {
    const bad = [];
    const re = new RegExp(`${PREFIX}-(${Object.keys(VALID).join("|")})-([a-z0-9]+)`, "g");
    for (const [file, src] of FILES) {
      for (const m of src.matchAll(re)) {
        const [cls, family, suffix] = m;
        // an opacity modifier like accent/25 is fine; a bare suffix must be known
        if (!VALID[family].includes(suffix)) bad.push(`${file}: ${cls}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("no raw palette steps outside the token definitions", () => {
    const re = new RegExp(`${PREFIX}-(?:gray|slate|zinc|neutral|stone|orange|red|green|blue|yellow|amber|emerald|indigo|purple|pink)-[0-9]{2,3}`, "g");
    const bad = [];
    for (const [file, src] of FILES) {
      for (const m of src.matchAll(re)) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  test("no orphaned dark: variants — the token layer handles both themes", () => {
    const bad = [];
    for (const [file, src] of FILES) {
      for (const m of src.matchAll(/dark:[a-z-]+-[a-z]+-[0-9]{2,3}/g)) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
