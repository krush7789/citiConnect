import * as React from "react";

import { cn } from "@/lib/utils";

const FieldLabel = ({ children, className, required = false, ...props }) => (
  <label className={cn("mb-1 block text-xs font-medium text-muted-foreground", className)} {...props}>
    {children}
    {required ? <span className="text-destructive"> *</span> : null}
  </label>
);

const FieldError = ({ children, className }) => (
  <p className={cn("mt-1 text-xs text-destructive", className)}>{children}</p>
);

const ReadOnlyField = ({ children, className }) => (
  <div
    className={cn(
      "flex h-10 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-foreground/90",
      className
    )}
  >
    {children}
  </div>
);

export { FieldError, FieldLabel, ReadOnlyField };
