import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

/**
 * Render smoke tests.
 *
 * These exist because of a specific bug: during the P4 icon work, one entry in
 * the Landing features list kept its emoji `icon` key after the rest were
 * converted to `Icon` components. The page rendered <undefined /> and threw
 * React error #130 — a blank screen on the first thing a visitor sees. Lint
 * passed, the build passed, every existing test passed. Nothing caught it except
 * loading the page.
 *
 * Mounting each screen catches that whole class: an undefined component, a bad
 * hook call, a destructure of undefined during first paint. It asserts almost
 * nothing about appearance — the job is "does it render at all".
 */

// Screens fetch on mount. Resolve everything to empty so nothing is pending.
vi.mock("./utils/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

const USER = {
  user_id: "u1", name: "Test Person", email: "t@example.com",
  mode: "supportive", timezone: "UTC", onboarding_completed: true,
  notification_rules: [{ days: [0, 1, 2, 3, 4, 5, 6], time: "20:00" }],
  email_daily_reminder: true, email_weekly_summary: true,
};

vi.mock("./context/AuthContext", async () => {
  const actual = await vi.importActual("./context/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      user: USER, setUser: vi.fn(), loading: false,
      logout: vi.fn(), refreshUser: vi.fn(),
    }),
  };
});

import { ThemeProvider } from "./context/ThemeContext";
import Landing from "./components/Landing";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import AICoach from "./components/AICoach";
import Achievements from "./components/Achievements";
import Settings from "./components/Settings";

afterEach(cleanup);

const SCREENS = [
  ["Landing", Landing],
  ["Login", Login],
  ["ResetPassword", ResetPassword],
  ["Onboarding", Onboarding],
  ["Dashboard", Dashboard],
  ["Analytics", Analytics],
  ["AICoach", AICoach],
  ["Achievements", Achievements],
  ["Settings", Settings],
];

describe("every screen mounts without throwing", () => {
  test.each(SCREENS)("%s", (name, Component) => {
    // A React render error (including error #130 — "element type is invalid",
    // which is what an undefined component produces) throws out of render().
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a[0]));
    try {
      expect(() =>
        render(
          <MemoryRouter>
            <ThemeProvider>
              <Component />
            </ThemeProvider>
          </MemoryRouter>
        )
      ).not.toThrow();
      const fatal = errors.filter((e) =>
        typeof e === "string" && /Element type is invalid|is not a function|Cannot read/.test(e));
      expect(fatal).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
