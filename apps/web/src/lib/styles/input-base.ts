import { cva } from "class-variance-authority";

export const inputBaseVariants = cva([
  "rounded-xl border border-border/72 bg-input/78",
  "shadow-[0_8px_20px_-22px_hsl(var(--shadow-color)/0.42)]",
  "transition-[background-color,border-color,box-shadow,color] outline-none",
  "focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42",
  "disabled:cursor-not-allowed disabled:bg-input/54 disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  "md:text-sm",
  "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
]);
