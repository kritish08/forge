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
        "flex h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base",
        "text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:border-orange-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
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
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2",
        "dark:focus-visible:ring-offset-gray-950",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
