import { vi } from "vitest";

/**
 * jsdom gaps the app relies on.
 *
 * These are environment shims, not behaviour under test — stubbing them wrong
 * would hide real bugs, so each mirrors the real API's shape rather than
 * returning something convenient.
 */

// This file runs for every suite, including the pure-logic ones that use the
// node environment and have no window at all.
const hasDom = typeof window !== "undefined";

// ThemeProvider reads this to resolve the "system" theme.
if (hasDom && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,              // default to the light scheme
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),        // deprecated, still called by some libraries
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// The charts size themselves from their container.
if (hasDom && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Sheets capture the pointer while dragging.
if (hasDom && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
