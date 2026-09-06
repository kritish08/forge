/**
 * Line icons, replacing the emoji that stood in for iconography (🔥 ⚡ 📊 🌱 💪 🌍 📧 🔔).
 *
 * Emoji render differently on every platform, can't take the accent colour, and
 * read as decoration rather than interface. Mood faces are NOT here — those are
 * content the user is choosing between, not UI furniture, so they stay as emoji.
 *
 * All icons inherit currentColor and size from a `className`.
 */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": "true",
};

export const Flame = (p) => (
  <svg {...base} {...p}><path d="M12 3c.5 3 2.5 4 3.8 5.6A6.6 6.6 0 0 1 17.5 13a5.5 5.5 0 0 1-11 0c0-1.6.6-2.9 1.5-4 .3 1 1 1.6 1.8 1.8-.2-2.6.6-5.6 2.2-7.8Z" /></svg>
);
export const Bolt = (p) => (
  <svg {...base} {...p}><path d="M13 2 4.5 13.2h6L11 22l8.5-11.2h-6L13 2Z" /></svg>
);
export const Home = (p) => (
  <svg {...base} {...p}><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-5.5h5V20" /></svg>
);
export const Chart = (p) => (
  <svg {...base} {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></svg>
);
export const Spark = (p) => (
  <svg {...base} {...p}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M4.9 4.9 7 7" /><path d="M17 17l2.1 2.1" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="M4.9 19.1 7 17" /><path d="M17 7l2.1-2.1" /><circle cx="12" cy="12" r="3.2" /></svg>
);
export const Trophy = (p) => (
  <svg {...base} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5.5H5.5v1A3.5 3.5 0 0 0 8 9.8" /><path d="M16 5.5h2.5v1A3.5 3.5 0 0 1 16 9.8" /><path d="M12 13v3.5" /><path d="M9 20h6" /><path d="M10.5 16.5h3l.5 3.5h-4l.5-3.5Z" /></svg>
);
export const Gear = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.3 4.4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.6 1.3Z" /></svg>
);
export const Check = (p) => (
  <svg {...base} strokeWidth={2.75} {...p}><path d="M5 12.5 9.5 17 19 7.5" /></svg>
);
export const Chevron = (p) => (
  <svg {...base} {...p}><path d="M9 5.5 15.5 12 9 18.5" /></svg>
);
export const Plus = (p) => (
  <svg {...base} strokeWidth={2.25} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);
export const Close = (p) => (
  <svg {...base} strokeWidth={2.25} {...p}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
);
export const Pencil = (p) => (
  <svg {...base} {...p}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 6.5 17.5 9.5" /></svg>
);
export const Trash = (p) => (
  <svg {...base} {...p}><path d="M4 7h16" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M6.5 7l.8 12A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /><path d="M10.5 11v5.5" /><path d="M13.5 11v5.5" /></svg>
);
export const Bell = (p) => (
  <svg {...base} {...p}><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" /><path d="M10 18a2 2 0 0 0 4 0" /></svg>
);
export const Mail = (p) => (
  <svg {...base} {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.8 7 7.2 5.5a1.6 1.6 0 0 0 2 0L20.2 7" /></svg>
);
export const Globe = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5Z" /></svg>
);
export const Undo = (p) => (
  <svg {...base} {...p}><path d="M4 9h10a5 5 0 0 1 0 10h-4" /><path d="m7.5 5.5-3.5 3.5 3.5 3.5" /></svg>
);
export const Heart = (p) => (
  <svg {...base} {...p}><path d="M12 19.5S4.5 15 4.5 9.8A3.8 3.8 0 0 1 12 8.1a3.8 3.8 0 0 1 7.5 1.7c0 5.2-7.5 9.7-7.5 9.7Z" /></svg>
);
