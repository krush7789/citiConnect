import React from "react";

const AuthField = ({ id, label, required = true, error, children }) => {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default AuthField;
