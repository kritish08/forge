import { forwardRef } from "react";
import { cn } from "../../lib/utils";

/**
 * The two primitives the app actually used out of shadcn/ui.
 *
 * The generated `components/ui/` tree carried 46 files; only Input and Button
 * were ever imported by application code (by Login and ResetPassword). The rest —
 * accordion, carousel, command palette, menubar, resizable panels, date picker —
 * were unreachable, and with them ~30 npm dependencies. These replacements drop
 * class-variance-authority and @radix-ui/react-slot too, since exactly one
 * variant of each was in use.
 */

export const Input = forwardRef(function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-line bg-surface-sunk px-3 py-2 text-base",
        "text-ink placeholder:text-ink-subtle transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export const Button = forwardRef(function Button({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
