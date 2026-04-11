/**
 * @file 空状态基础 UI 组件模块。
 */

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyVariants = cva(
  "surface-light flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance animate-fade-in",
);

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty" className={cn(emptyVariants(), className)} {...props} />;
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "surface-elevated flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground/80 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-ui-body font-medium tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-ui-subtle text-muted-foreground max-w-[40ch] [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-3 text-balance",
        className,
      )}
      {...props}
    />
  );
}

function EmptyActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-actions"
      className={cn("flex flex-wrap items-center justify-center gap-2 mt-2", className)}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
  EmptyActions,
  emptyVariants,
  emptyMediaVariants,
};
