import React from "react";
import { cn } from "@/lib/utils";

export const AdminPageHeader = ({ title, description, actions }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
  </div>
);

const toneClass = {
  neutral: "text-muted-foreground",
  error: "text-destructive",
  success: "text-emerald-700",
};

export const AdminInlineState = ({ tone = "neutral", children, className }) => (
  <p className={cn("text-sm", toneClass[tone] || toneClass.neutral, className)}>{children}</p>
);

export const AdminEmptyState = ({ message, className }) => (
  <div className={cn("rounded-lg border p-5 text-sm text-muted-foreground", className)}>{message}</div>
);

