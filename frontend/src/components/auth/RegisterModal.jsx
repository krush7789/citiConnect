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
  name: Yup.string().trim().required("Full name is required."),
  email: Yup.string().email("Enter a valid email address.").required("Email is required."),
  password: Yup.string().min(8, "Password must be at least 8 characters.").required("Password is required."),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Confirm password does not match.")
    .required("Confirm password is required."),
});

const RegisterModal = () => {
  const { register, switchAuthModal, authLoading } = useAuth();
  const [error, setError] = useState("");

  const formik = useFormik({
    initialValues: { name: "", email: "", password: "", confirmPassword: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError("");
      try {
        await register({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          confirm_password: values.confirmPassword,
        });
      } catch (err) {
        setError(err.normalized?.message || "Unable to register. Please try again.");
      }
    },
  });

  return (
    <AuthModalLayout
      title="Create account"
      subtitle="Sign up once and continue across all modules"
      footer={
        <div className="text-center text-sm">
          Already have an account?{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => switchAuthModal("login")}>
            Login
          </button>
        </div>
      }
    >
      <form onSubmit={formik.handleSubmit} className="space-y-4">
        <AuthField id="register_name" label="Full name" error={formik.touched.name ? formik.errors.name : ""}>
          <Input
            id="register_name"
            name="name"
            placeholder="Full name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        <AuthField id="register_email" label="Email address" error={formik.touched.email ? formik.errors.email : ""}>
          <Input
            id="register_email"
            name="email"
            type="email"
            placeholder="Email address"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        <AuthField
          id="register_password"
          label="Password"
          error={formik.touched.password ? formik.errors.password : ""}
        >
          <Input
            id="register_password"
            name="password"
            type="password"
            placeholder="Password"
            value={formik.values.password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        <AuthField
          id="register_confirm_password"
          label="Confirm password"
          error={formik.touched.confirmPassword ? formik.errors.confirmPassword : ""}
        >
          <Input
            id="register_confirm_password"
            name="confirmPassword"
            type="password"
            placeholder="Confirm password"
            value={formik.values.confirmPassword}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
        </AuthField>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={authLoading || !formik.isValid}>
          {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>
      </form>
    </AuthModalLayout>
  );
};

export default RegisterModal;
