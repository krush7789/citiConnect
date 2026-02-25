import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, Mail, Phone, ShieldCheck, ShieldX, UserRound } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { mediaService, userService } from "@/api/services";

const roleText = (role) => {
  if (!role) return "USER";
  return String(role).replace(/_/g, " ");
};

const initialsFrom = (name, email) => {
  const source = String(name || "").trim() || String(email || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const validationSchema = Yup.object({
  name: Yup.string().trim().required("Full name is required."),
  phone: Yup.string().max(32, "Phone is too long."),
  profile_image_url: Yup.string().max(500, "Image URL is too long."),
});

const emptyProfileValues = {
  name: "",
  phone: "",
  profile_image_url: "",
};

const ProfilePage = () => {
  const { requireAuth, isAuthenticated, user, setCurrentUser, switchAuthModal } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profileInitialValues, setProfileInitialValues] = useState(emptyProfileValues);
  const fileInputRef = useRef(null);
  const formik = useFormik({
    initialValues: profileInitialValues,
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
      setSaving(true);
      setMessage("");
      setError("");
      try {
        const updated = await userService.updateMe(values);
        const nextValues = {
          name: updated.name || "",
          phone: updated.phone || "",
          profile_image_url: updated.profile_image_url || "",
        };
        setCurrentUser(updated);
        setProfileInitialValues(nextValues);
        formik.setValues(nextValues, false);
        setMessage("Profile updated successfully.");
      } catch (err) {
        setError(err?.normalized?.message || "Unable to update profile.");
      } finally {
        setSaving(false);
      }
    },
  });

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: "/profile" })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    userService
      .getMe()
      .then((me) => {
        if (!mounted) return;
        setCurrentUser(me);
        setProfileInitialValues({
          name: me.name || "",
          phone: me.phone || "",
          profile_image_url: me.profile_image_url || "",
        });
      })
      .catch(() => {
        if (!mounted) return;
        setError("Unable to load profile details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, requireAuth, setCurrentUser]);

  const profileCompletion = useMemo(() => {
    let score = 0;
    if (formik.values.name.trim()) score += 1;
    if (formik.values.phone.trim()) score += 1;
    if (formik.values.profile_image_url.trim()) score += 1;
    return Math.round((score / 3) * 100);
  }, [formik.values.name, formik.values.phone, formik.values.profile_image_url]);

  const onPickImage = () => {
    fileInputRef.current?.click();
  };

  const onSelectProfileImage = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setUploadingImage(true);
    setMessage("");
    setError("");
    try {
      const upload = await mediaService.uploadImage(selected, { folder: "profiles" });
      formik.setFieldValue("profile_image_url", upload?.url || formik.values.profile_image_url);
      setMessage("Profile image uploaded. Save changes to persist.");
    } catch (err) {
      setError(err?.normalized?.message || "Unable to upload profile image.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const onRemoveImage = () => {
    formik.setFieldValue("profile_image_url", "");
    setMessage("Profile image removed. Save changes to persist.");
    setError("");
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view your profile.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10 max-w-5xl">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account details, image, and security settings.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile Photo</CardTitle>
              <CardDescription>Visible on your account and bookings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <Avatar className="h-28 w-28 border">
                  <AvatarImage src={formik.values.profile_image_url || undefined} alt={formik.values.name || "Profile"} />
                  <AvatarFallback className="text-xl font-semibold">
                    {initialsFrom(formik.values.name, user?.email)}
                  </AvatarFallback>
                </Avatar>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onSelectProfileImage}
                className="hidden"
              />

              <div className="space-y-2">
                <Button type="button" variant="outline" className="w-full" onClick={onPickImage} disabled={uploadingImage}>
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Upload New Photo
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={!formik.values.profile_image_url || uploadingImage}
                  onClick={onRemoveImage}
                >
                  Remove Photo
                </Button>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Profile completion</p>
                <p className="text-sm font-semibold mt-1">{profileCompletion}%</p>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${profileCompletion}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="secondary">{roleText(user?.role)}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Account</span>
                <Badge variant={user?.is_active ? "default" : "destructive"}>
                  {user?.is_active ? (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldX className="h-3.5 w-3.5" />
                      Inactive
                    </span>
                  )}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Details</CardTitle>
              <CardDescription>Fields follow the user model used by backend.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={formik.handleSubmit}>
                <div className="grid gap-4 md:grid-cols-1">
                  <div className="space-y-1.5">
                    <label htmlFor="profile_name" className="text-xs font-medium text-muted-foreground">
                      Full name <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <UserRound className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="profile_name"
                        name="name"
                        value={formik.values.name}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        className="pl-9"
                        placeholder="Enter full name"
                      />
                    </div>
                    {formik.touched.name && formik.errors.name ? <p className="text-xs text-destructive">{formik.errors.name}</p> : null}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="profile_email" className="text-xs font-medium text-muted-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input id="profile_email" type="email" value={user?.email || ""} className="pl-9" disabled />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="profile_phone" className="text-xs font-medium text-muted-foreground">
                      Phone
                    </label>
                    <div className="relative">
                      <Phone className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="profile_phone"
                        name="phone"
                        value={formik.values.phone}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        className="pl-9"
                        placeholder="+91XXXXXXXXXX"
                      />
                    </div>
                    {formik.touched.phone && formik.errors.phone ? <p className="text-xs text-destructive">{formik.errors.phone}</p> : null}
                  </div>
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button type="submit" disabled={saving || uploadingImage || !formik.isValid}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => switchAuthModal("change_password")}>
                    Change password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
