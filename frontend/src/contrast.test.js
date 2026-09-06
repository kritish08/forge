import fs from "node:fs";
import path from "node:path";

/**
 * Contrast floor for the token palette.
 *
 * Every contrast failure found in the P3 review was token-level, not
 * screen-level — one value being slightly too light failed the same way on nine
 * screens at once. Checking the tokens catches all of it in milliseconds,
 * without a browser.
 *
 * This does NOT replace looking at the rendered app: it cannot see a component
 * that puts the wrong pair together (white text on a light fill, say). It fixes
 * the palette; scripts/audit-contrast.js checks the composition.
 */

const css = fs.readFileSync(path.join(process.cwd(), "src/tokens.css"), "utf8");

function block(selector) {
  // the last matching block wins, same as the cascade
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
  let body = "";
  for (const m of css.matchAll(re)) body += m[1];
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+)\s*;/g)) {
    out[m[1]] = [+m[2], +m[3], +m[4]];
  }
  return out;
}

const relLum = ([r, g, b]) =>
  [r, g, b]
    .map((v) => v / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);

const ratio = (a, b) => {
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const THEMES = { light: block(":root"), dark: block(".dark") };

// Body text must clear 4.5:1; a large/bold heading may sit at 3:1, but none of
// these tokens are heading-only, so hold them all to 4.5.
const AA = 4.5;
const TEXT_ON_SURFACE = [
  ["text", "surface"], ["text", "surface-raised"], ["text", "surface-sunk"],
  ["text-muted", "surface"], ["text-muted", "surface-raised"], ["text-muted", "surface-sunk"],
  ["text-subtle", "surface"], ["text-subtle", "surface-raised"], ["text-subtle", "surface-sunk"],
];

describe.each(Object.entries(THEMES))("%s theme", (themeName, t) => {
  test.each(TEXT_ON_SURFACE)("%s on %s clears AA", (fg, bg) => {
    const r = ratio(t[fg], t[bg]);
    expect({ pair: `${fg}/${bg}`, ratio: +r.toFixed(2) })
      .toEqual({ pair: `${fg}/${bg}`, ratio: expect.any(Number) });
    expect(r).toBeGreaterThanOrEqual(AA);
  });

  test("accent carries its contrast colour both ways", () => {
    // The accent is used as a fill behind accent-contrast AND as text on a
    // surface. Contrast is symmetric, so one value has to satisfy both — this is
    // what orange-600 failed at 3.56:1.
    expect(ratio(t.accent, t["accent-contrast"])).toBeGreaterThanOrEqual(AA);
    expect(ratio(t.accent, t.surface)).toBeGreaterThanOrEqual(AA);
    expect(ratio(t.accent, t["surface-raised"])).toBeGreaterThanOrEqual(AA);
  });

  test("status colours are legible on their own soft backgrounds", () => {
    for (const s of ["success", "warning", "danger"]) {
      expect(ratio(t[s], t[`${s}-soft`])).toBeGreaterThanOrEqual(AA);
      expect(ratio(t[s], t["surface-raised"])).toBeGreaterThanOrEqual(AA);
    }
  });

  test("inverse band text is legible on the inverse surface", () => {
    expect(ratio(t["text-on-inverse"], t["surface-inverse"])).toBeGreaterThanOrEqual(AA);
    expect(ratio(t["text-on-inverse-muted"], t["surface-inverse"])).toBeGreaterThanOrEqual(AA);
  });

  // CSS names these --border/--border-strong; Tailwind exposes them as line/*.
  test("borders are visible against their surfaces", () => {
    expect(ratio(t.border, t.surface)).toBeGreaterThanOrEqual(1.2);
    expect(ratio(t["border-strong"], t["surface-raised"])).toBeGreaterThanOrEqual(1.4);
  });
});
