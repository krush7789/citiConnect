import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const validationSchema = Yup.object({
  email: Yup.string().email("Enter a valid email address.").required("Email is required."),
});

const ForgotPasswordModal = () => {
  const { forgotPassword, switchAuthModal, authLoading } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const formik = useFormik({
    initialValues: { email: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError("");
      setMessage("");
      try {
        const response = await forgotPassword({ email: values.email });
        setMessage(response.message || "If account exists, temporary password has been sent.");
      } catch (err) {
        setError(err.normalized?.message || "Could not process this request.");
      }
    },
  });

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight">Forgot password</h2>
        <p className="text-sm text-muted-foreground">We will send a temporary password to your email.</p>
      </div>

      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="forgot_email" className="text-xs font-medium text-muted-foreground">
            Email address <span className="text-destructive">*</span>
          </label>
          <Input
            id="forgot_email"
            name="email"
            type="email"
            placeholder="Email address"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
          {formik.touched.email && formik.errors.email ? (
            <p className="text-xs text-destructive">{formik.errors.email}</p>
          ) : null}
        </div>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading || !formik.isValid}>
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
