import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";

const LoginModal = () => {
  const navigate = useNavigate();
  const { login, switchAuthModal, authLoading, setPendingIntent } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const nextUser = await login(form);
      if (nextUser?.role === USER_ROLE.ADMIN) {
        setPendingIntent(null);
        navigate("/admin/dashboard");
      }
    } catch (err) {
      setError(err.normalized?.message || "Unable to login. Please try again.");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-foreground">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Login to continue booking on CitiConnect</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("forgot_password")}>
          Forgot password?
        </button>
        <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("register")}>
          Create account
        </button>
      </div>
    </div>
  );
};

export default LoginModal;
