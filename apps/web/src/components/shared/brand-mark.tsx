/**
 * @file 品牌标识共享组件模块。
 */

import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  alt: string;
  className?: string;
  subtitle?: string;
  title: string;
};

/**
 * 渲染产品品牌标识。
 */
export function BrandMark({ alt, className, subtitle, title }: BrandMarkProps) {
  return (
    <div className={cn("flex select-none items-center gap-3", className)}>
      <span className="surface-inline flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        <img
          alt={alt}
          className="size-8 rounded-lg object-cover select-none"
          draggable={false}
          src={logoUrl}
        />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-[11px] leading-relaxed text-muted-foreground/68">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
