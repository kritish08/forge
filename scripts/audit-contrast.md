# Contrast audit — how to run it yourself

`frontend/src/contrast.test.js` checks the **palette**: it proves every text
token clears 4.5:1 against every surface token, in both themes, in milliseconds
and with no browser. It runs in CI.

What it cannot see is **composition** — a component pairing the wrong two tokens
(white text on a light fill, say). For that you have to render the app and
measure what actually landed on screen. This is that check.

## Running it

Open the app in Chrome, sign in, then paste this into DevTools → Console on each
screen you want to check. Toggle the theme and run it again.

```js
(() => {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return null;
    const [r,g,b] = m.slice(0,3).map(Number).map(v => {
      const s = v/255; return s <= 0.03928 ? s/12.92 : ((s+0.055)/1.055)**2.4;
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
    }
    return 'rgb(255,255,255)';
  };
  const fails = [];
  for (const el of document.querySelectorAll('p,span,h1,h2,h3,h4,a,button,li,label')) {
    const txt = el.textContent?.trim();
    if (!txt || el.children.length || txt.length > 90) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.2) continue;
    const l1 = lum(cs.color), l2 = lum(bgOf(el));
    if (l1 === null || l2 === null) continue;
    const ratio = (Math.max(l1,l2)+0.05) / (Math.min(l1,l2)+0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight,10) >= 700);
    const need = large ? 3 : 4.5;                    // WCAG AA
    if (ratio < need) fails.push({ text: txt.slice(0,40), ratio: +ratio.toFixed(2), need, color: cs.color, bg: bgOf(el) });
  }
  console.table(fails);
  console.log(fails.length ? `${fails.length} below AA` : 'all text clears AA');
  return fails.length;
})();
```

## Reading the result

- **Empty table** — that screen passes in that theme.
- **A ratio near the threshold (4.3–4.5)** on many elements at once — a *token* is
  slightly too light. Fix `frontend/src/tokens.css`; `contrast.test.js` will
  confirm it.
- **A ratio around 2–3.6 on a few elements** — a *component* paired the wrong
  tokens. Look for a hardcoded `text-white` on a fill, or `bg-ink` (which flips
  with the theme) where `bg-inverse` (which doesn't) was meant.

## Known and accepted

Decorative-only text below AA is still a failure worth fixing, but two things are
excluded by design:

- **Disabled controls** — WCAG exempts them; the audit skips anything under 0.2
  opacity but a disabled button at 0.4 will still show up. Ignore those.
- **Placeholder text** inside inputs is checked and should pass; it uses
  `--text-subtle`, which the palette test holds to AA.
