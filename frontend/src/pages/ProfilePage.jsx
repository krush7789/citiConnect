import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { userService } from "@/api/services";

const ProfilePage = () => {
  const { requireAuth, isAuthenticated, user, switchAuthModal } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", profile_image_url: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
        setForm({
          name: me.name || "",
          phone: me.phone || "",
          profile_image_url: me.profile_image_url || "",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, requireAuth]);

  const onSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const updated = await userService.updateMe(form);
    setForm({
      name: updated.name || "",
      phone: updated.phone || "",
      profile_image_url: updated.profile_image_url || "",
    });
    setMessage("Profile updated successfully.");
    setSaving(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border p-5 bg-white">
            <h2 className="font-semibold mb-4">Account details</h2>
            <form className="space-y-4" onSubmit={onSave}>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Full name"
              />
              <Input type="email" value={user?.email || ""} disabled />
              <Input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Phone"
              />
              <Input
                value={form.profile_image_url}
                onChange={(event) => setForm((prev) => ({ ...prev, profile_image_url: event.target.value }))}
                placeholder="Profile image URL"
              />
              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => switchAuthModal("change_password")}>
                  Change password
                </Button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border p-5 bg-white">
            <h2 className="font-semibold mb-3">Your stats</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total bookings</p>
                <p className="text-xl font-bold">{user?.stats?.total_bookings || 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="text-xl font-bold">{user?.stats?.upcoming_bookings || 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total spent</p>
                <p className="text-xl font-bold">Rs {user?.stats?.total_spent || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
