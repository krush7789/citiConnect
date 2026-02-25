import React from "react";

const AuthModalLayout = ({ title, subtitle, children, footer }) => {
  return (
    <div className="space-y-5 p-6">
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-black tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div>{footer}</div> : null}
    </div>
  );
};

export default AuthModalLayout;
