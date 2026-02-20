import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const selectVariants = cn(
  "flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors",
  "hover:border-primary/25 focus-visible:border-primary/35",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const Select = React.forwardRef(
  (
    {
      className,
      wrapperClassName,
      iconClassName,
      showIcon = true,
      children,
      ...props
    },
    ref
  ) => (
    <div className={cn("relative w-full", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(selectVariants, showIcon ? "pr-9" : "", className)}
        {...props}
      >
        {children}
      </select>
      {showIcon ? (
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/90",
            iconClassName
          )}
        />
      ) : null}
    </div>
  )
);

Select.displayName = "Select";

export { Select };
