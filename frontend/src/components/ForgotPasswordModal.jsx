import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const ForgotPasswordModal = () => {
  const { forgotPassword, switchAuthModal, authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await forgotPassword({ email });
      setMessage(response.message || "If account exists, temporary password has been sent.");
    } catch (err) {
      setError(err.normalized?.message || "Could not process this request.");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight">Forgot password</h2>
        <p className="text-sm text-muted-foreground">We will send a temporary password to your email.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send temporary password"}
        </Button>
      </form>

      <div className="text-center text-sm">
        <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("login")}>
          Back to login
        </button>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
