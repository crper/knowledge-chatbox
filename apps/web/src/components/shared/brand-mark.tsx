/**
 * @file 品牌标识共享组件模块。
 */

import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  alt: string;
  className?: string;
  compact?: boolean;
  subtitle?: string;
  title: string;
};

/**
 * 渲染产品品牌标识。
 */
export function BrandMark({ alt, className, compact = false, subtitle, title }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex select-none items-center",
        compact ? "size-11 justify-center" : "gap-3",
        className,
      )}
    >
      <span
        className={cn(
          "surface-inline flex shrink-0 items-center justify-center overflow-hidden",
          compact ? "size-11 rounded-2xl" : "size-10 rounded-xl",
        )}
      >
        <img
          alt={alt}
          className={cn(
            "object-cover select-none",
            compact ? "size-8.5 rounded-xl" : "size-8 rounded-lg",
          )}
          draggable={false}
          src={logoUrl}
        />
      </span>
      {compact ? null : (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[11px] leading-relaxed text-muted-foreground/68">
              {subtitle}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
