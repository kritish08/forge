import { useLocation, useNavigate } from "react-router-dom";
import { Home, Chart, Spark, Trophy, Gear } from "./icons";

const NAV_ITEMS = [
  { path: "/", label: "Today", Icon: Home },
  { path: "/analytics", label: "Analytics", Icon: Chart },
  { path: "/coach", label: "Coach", Icon: Spark },
  { path: "/achievements", label: "Forge", Icon: Trophy },
  { path: "/settings", label: "Settings", Icon: Gear },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Main"
      // The frosted treatment used to exist only in dark mode — light mode was a
      // flat opaque white bar.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex w-full max-w-screen-sm">
        {NAV_ITEMS.map((item) => {
          const { path, label, Icon } = item;
          const active = location.pathname === path;
          return (
            <li key={path} className="flex-1">
              <button
                type="button"
                data-testid={`nav-${label.toLowerCase()}`}
                onClick={() => navigate(path)}
                // aria-current is how assistive tech knows which tab you're on;
                // colour alone never communicated it.
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 transition-colors ${ active ?"text-accent" : "text-ink-subtle"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" />
                <span className={`text-[10.5px] ${active ?"font-semibold" : "font-medium"}`}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
