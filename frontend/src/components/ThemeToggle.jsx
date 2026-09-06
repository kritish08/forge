import { useTheme } from "../context/ThemeContext";

const NEXT = { system: "light", light: "dark", dark: "system" };
const LABEL = { system: "Match system", light: "Light", dark: "Dark" };

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme] || "system")}
      title={LABEL[theme]}
      aria-label={`Theme: ${LABEL[theme]}. Activate to switch.`}
      className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors active:bg-surface-sunk"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
          <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z" />
        </svg>
      ) : theme === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="13" rx="2" />
          <path d="M8 20.5h8" />
        </svg>
      )}
    </button>
  );
}
