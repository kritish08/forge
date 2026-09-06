import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Bottom sheet.
 *
 * The app had three hand-rolled versions of this (wellness warning, Direct Mode
 * activation, habit detail) and none of them was a dialog: no role, no
 * aria-modal, no focus trap, no Escape handler, and no scroll lock — so on iOS
 * the page scrolled behind the sheet while you were using it. Each drew the
 * grabber pill that means "drag me down to dismiss" and then implemented no drag.
 *
 * This one is a real dialog, and the grabber works.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  labelledBy,
}) {
  const panelRef = useRef(null);
  const restoreFocusTo = useRef(null);
  const [drag, setDrag] = useState(0);
  const gesture = useRef(null);

  // ── Scroll lock ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;
    const { body } = document;
    const prev = body.style.overflow;
    const prevPad = body.style.paddingRight;
    // Compensate for the scrollbar so the page doesn't jump on desktop.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prev;
      body.style.paddingRight = prevPad;
    };
  }, [open]);

  // ── Focus management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusTo.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus({ preventScroll: true });
    return () => {
      // Send focus back where it came from, so keyboard and screen-reader users
      // aren't dumped at the top of the document.
      const el = restoreFocusTo.current;
      if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  // ── Drag to dismiss ───────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    gesture.current = { startY: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!gesture.current) return;
    // Downwards only — dragging up shouldn't lift the sheet off the edge.
    setDrag(Math.max(0, e.clientY - gesture.current.startY));
  };
  const endDrag = () => {
    if (!gesture.current) return;
    gesture.current = null;
    // Past a quarter of the panel height, let it go.
    const height = panelRef.current?.offsetHeight ?? 400;
    if (drag > Math.min(height * 0.25, 140)) onClose();
    else setDrag(0);
  };

  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? "sheet-title" : undefined)}
        aria-describedby={description ? "sheet-desc" : undefined}
        tabIndex={-1}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: gesture.current ? "none" : "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
        }}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[26px] bg-surface-raised shadow-sheet outline-none sm:max-w-md sm:rounded-[26px] motion-safe:animate-[slide-in-from-bottom-4_260ms_cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* Grabber. It is the drag handle, not decoration — the whole header
            strip is the target, because a 48x4 pill is not a tap target. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="shrink-0 cursor-grab touch-none px-6 pb-2 pt-3 active:cursor-grabbing"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
        </div>

        {(title || description) && (
          <div className="shrink-0 px-6 pb-3">
            {title && (
              <h2 id="sheet-title" className="font-chivo text-xl font-bold tracking-tight text-ink">
                {title}
              </h2>
            )}
            {description && (
              <p id="sheet-desc" className="mt-1 text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">{children}</div>

        {footer && <div className="shrink-0 border-t border-line px-6 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmation sheet, replacing window.confirm — which is jarring system chrome
 * on mobile and can be suppressed outright in an installed PWA.
 */
export function ConfirmSheet({
  open, onClose, onConfirm, title, description,
  confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, busy = false,
}) {
  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      footer={
        <div className="flex gap-3 pb-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-line py-3 font-chivo text-sm font-bold text-ink-muted transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-xl py-3 font-chivo text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${ destructive ?"bg-danger text-white"
                : "bg-ink text-surface-raised"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="pb-2" />
    </Sheet>
  );
}
