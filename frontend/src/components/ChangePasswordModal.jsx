import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const validationSchema = Yup.object({
  current_password: Yup.string().required("Current password is required."),
  new_password: Yup.string().min(8, "New password must be at least 8 characters.").required("New password is required."),
  confirm_new_password: Yup.string()
    .oneOf([Yup.ref("new_password")], "Confirm password does not match.")
    .required("Confirm password is required."),
}).test(
  "different-passwords",
  "New password must be different from current password.",
  (values) => !values || values.current_password !== values.new_password
);

const ChangePasswordModal = ({ forced = false }) => {
  const { changePassword, switchAuthModal, authLoading } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const formik = useFormik({
    initialValues: { current_password: "", new_password: "", confirm_new_password: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError("");
      setSuccess("");
      try {
        const response = await changePassword(values);
        setSuccess(response.message || "Password updated successfully.");
        formik.resetForm();
      } catch (err) {
        setError(err.normalized?.message || "Unable to update password.");
      }
    },
  });

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight">{forced ? "Set a new password" : "Change password"}</h2>
        <p className="text-sm text-muted-foreground">
          {forced ? "You are using a temporary password. Create a permanent password to continue." : "Update your password securely."}
        </p>
      </div>

      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="change_current_password" className="text-xs font-medium text-muted-foreground">
            Current password <span className="text-destructive">*</span>
          </label>
          <Input
            id="change_current_password"
            name="current_password"
            type="password"
            placeholder="Current password"
            value={formik.values.current_password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
          {formik.touched.current_password && formik.errors.current_password ? (
            <p className="text-xs text-destructive">{formik.errors.current_password}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="change_new_password" className="text-xs font-medium text-muted-foreground">
            New password <span className="text-destructive">*</span>
          </label>
          <Input
            id="change_new_password"
            name="new_password"
            type="password"
            placeholder="New password"
            value={formik.values.new_password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
          {formik.touched.new_password && formik.errors.new_password ? (
            <p className="text-xs text-destructive">{formik.errors.new_password}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="change_confirm_new_password" className="text-xs font-medium text-muted-foreground">
            Confirm new password <span className="text-destructive">*</span>
          </label>
          <Input
            id="change_confirm_new_password"
            name="confirm_new_password"
            type="password"
            placeholder="Confirm new password"
            value={formik.values.confirm_new_password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
          {formik.touched.confirm_new_password && formik.errors.confirm_new_password ? (
            <p className="text-xs text-destructive">{formik.errors.confirm_new_password}</p>
          ) : null}
        </div>

        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading || !formik.isValid}>
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
