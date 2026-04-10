import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";

import { cn } from "@/lib/utils";

function ToggleGroup<Value extends string = string>({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive<Value>>) {
  return (
    <ToggleGroupPrimitive<Value>
      className={cn(
        "inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5",
        className,
      )}
      data-slot="toggle-group"
      {...props}
    />
  );
}

function ToggleGroupItem<Value extends string = string>({
  className,
  ...props
}: React.ComponentProps<typeof TogglePrimitive<Value>>) {
  return (
    <TogglePrimitive<Value>
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground outline-hidden transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm",
        className,
      )}
      data-slot="toggle-group-item"
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
