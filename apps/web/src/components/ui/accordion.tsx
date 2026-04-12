import * as React from "react";
import { cva } from "class-variance-authority";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

const accordionItemVariants = cva("border-b border-border/50 last:border-b-0");

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn(accordionItemVariants(), className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

const accordionTriggerVariants = cva(
  "flex flex-1 items-center justify-between py-3 text-sm font-medium transition-all hover:underline [&[data-panel-open]>svg]:rotate-180",
);

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(accordionTriggerVariants(), className)}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

const accordionContentVariants = cva(
  "overflow-hidden text-sm data-[ending-style]:h-0 data-[starting-style]:h-0",
);

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      className={cn(accordionContentVariants(), className)}
      data-slot="accordion-content"
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  accordionItemVariants,
  accordionTriggerVariants,
  accordionContentVariants,
};
