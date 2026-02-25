import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import AuthModalLayout from "@/components/auth/AuthModalLayout";
import AuthField from "@/components/auth/AuthField";

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
        setMessage(response.message || "If account exists, a new password has been sent.");
      } catch (err) {
        setError(err.normalized?.message || "Could not process this request.");
      }
    },
  });

  return (
    <AuthModalLayout
      title="Forgot password"
      subtitle="We will send a new password to your email."
      footer={
        <div className="text-center text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("login")}>
            Back to login
          </button>
        </div>
      }
    >
      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <AuthField id="forgot_email" label="Email address" error={formik.touched.email ? formik.errors.email : ""}>
          <Input
            id="forgot_email"
            name="email"
            type="email"
            placeholder="Email address"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading || !formik.isValid}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send new password"}
        </Button>
      </form>
    </AuthModalLayout>
  );
};

export default ForgotPasswordModal;
