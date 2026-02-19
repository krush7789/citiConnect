import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const ChangePasswordModal = ({ forced = false }) => {
  const { changePassword, switchAuthModal, authLoading } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_new_password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.new_password !== form.confirm_new_password) {
      setError("Confirm password does not match.");
      return;
    }
    if (form.new_password === form.current_password) {
      setError("New password must be different from current password.");
      return;
    }
    try {
      const response = await changePassword(form);
      setSuccess(response.message || "Password updated successfully.");
    } catch (err) {
      setError(err.normalized?.message || "Unable to update password.");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight">{forced ? "Set a new password" : "Change password"}</h2>
        <p className="text-sm text-muted-foreground">
          {forced ? "You are using a temporary password. Create a permanent password to continue." : "Update your password securely."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          type="password"
          placeholder="Current password"
          value={form.current_password}
          onChange={(event) => setForm((prev) => ({ ...prev, current_password: event.target.value }))}
          required
        />
        <Input
          type="password"
          placeholder="New password"
          value={form.new_password}
          onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
          required
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={form.confirm_new_password}
          onChange={(event) => setForm((prev) => ({ ...prev, confirm_new_password: event.target.value }))}
          required
        />

        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
        </Button>
      </form>

      {!forced ? (
        <div className="text-center text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("login")}>
            Back to login
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ChangePasswordModal;
