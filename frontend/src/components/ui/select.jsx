import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const selectVariants = cva(
  [
    "peer flex w-full appearance-none rounded-md border bg-background text-foreground shadow-sm transition-all duration-150",
    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-1",
    "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[&>option]:bg-popover [&>option]:text-popover-foreground",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-9 px-3 text-sm",
        default: "h-10 px-3.5 text-sm",
        lg: "h-11 px-4 text-base",
      },
      tone: {
        default: "border-input hover:border-primary/25 focus-visible:border-primary/35",
        subtle: "border-input bg-muted/20 hover:bg-muted/35 hover:border-primary/25 focus-visible:border-primary/35",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-muted/45 focus-visible:border-primary/30",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "default",
    },
  }
);

const selectIconVariants = cva(
  [
    "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground/90 transition-colors",
    "peer-focus-visible:text-primary peer-disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "right-2.5 h-3.5 w-3.5",
        default: "right-3 h-4 w-4",
        lg: "right-3.5 h-4 w-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const Select = React.forwardRef(
  (
    {
      className,
      wrapperClassName,
      iconClassName,
      size,
      tone,
      showIcon = true,
      children,
      ...props
    },
    ref
  ) => (
    <div className={cn("relative w-full", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(selectVariants({ size, tone }), showIcon ? "pr-9" : "", className)}
        {...props}
      >
        {children}
      </select>
      {showIcon ? (
        <ChevronDown
          className={cn(
            selectIconVariants({ size }),
            iconClassName
          )}
        />
      ) : null}
    </div>
  )
);

Select.displayName = "Select";

export { Select };
