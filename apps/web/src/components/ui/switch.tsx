import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

const SWITCH_CLASS =
  "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-px shadow-[inset_0_1.5px_2px] shadow-black/10 transition-[background-color,box-shadow] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input";

const SWITCH_THUMB_CLASS =
  "pointer-events-none block size-5 rounded-full bg-background shadow-[0_0_1px_1px_hsl(var(--border)/0.3),0_1px_1px_hsl(var(--border)/0.2)] ring-0 transition-transform duration-150 data-[checked]:translate-x-4 data-[unchecked]:translate-x-0";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(SWITCH_CLASS, className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={SWITCH_THUMB_CLASS} />
    </SwitchPrimitive.Root>
  );
}

export { Switch, SWITCH_CLASS, SWITCH_THUMB_CLASS };
