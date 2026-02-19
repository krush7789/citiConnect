import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const RegisterModal = () => {
  const { register, switchAuthModal, authLoading } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Confirm password does not match.");
      return;
    }
    try {
      await register({ name: form.name, email: form.email, password: form.password });
    } catch (err) {
      setError(err.normalized?.message || "Unable to register. Please try again.");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-foreground">Create account</h2>
        <p className="text-sm text-muted-foreground">Sign up once and continue across all modules</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          placeholder="Full name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
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
        <Input
          type="password"
          placeholder="Confirm password"
          value={form.confirmPassword}
          onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
          required
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>
      </form>

      <div className="text-center text-sm">
        Already have an account?{" "}
        <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("login")}>
          Login
        </button>
      </div>
    </div>
  );
};

export default RegisterModal;
