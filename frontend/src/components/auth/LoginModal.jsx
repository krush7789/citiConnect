import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";
import AuthModalLayout from "@/components/auth/AuthModalLayout";
import AuthField from "@/components/auth/AuthField";

const validationSchema = Yup.object({
  email: Yup.string().email("Enter a valid email address.").required("Email is required."),
  password: Yup.string().required("Password is required."),
});

const LoginModal = () => {
  const navigate = useNavigate();
  const { login, switchAuthModal, authLoading, setPendingIntent } = useAuth();
  const [error, setError] = useState("");

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError("");
      try {
        const nextUser = await login(values);
        if (nextUser?.role === USER_ROLE.ADMIN) {
          setPendingIntent(null);
          navigate("/admin/dashboard");
        }
      } catch (err) {
        setError(err.normalized?.message || "Unable to login. Please try again.");
      }
    },
  });

  return (
    <AuthModalLayout
      title="Welcome back"
      subtitle="Login to continue booking on CitiConnect"
      footer={
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("forgot_password")}>
            Forgot password?
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("register")}>
            Create account
          </button>
        </div>
      }
    >
      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <AuthField id="login_email" label="Email address" error={formik.touched.email ? formik.errors.email : ""}>
          <Input
            id="login_email"
            name="email"
            type="email"
            placeholder="Email address"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        <AuthField id="login_password" label="Password" error={formik.touched.password ? formik.errors.password : ""}>
          <Input
            id="login_password"
            name="password"
            type="password"
            placeholder="Password"
            value={formik.values.password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading || !formik.isValid}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
        </Button>
      </form>
    </AuthModalLayout>
  );
};

export default LoginModal;
