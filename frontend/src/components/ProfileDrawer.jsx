import React from "react";
import { Bell, Heart, LogOut, Lock, Ticket, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const menuItems = [
  { label: "My Bookings", icon: Ticket, path: "/bookings" },
  { label: "Wishlist", icon: Heart, path: "/wishlist" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Profile", icon: User, path: "/profile" },
];

const ProfileDrawer = ({ onClose }) => {
  const navigate = useNavigate();
  const { user, logout, switchAuthModal } = useAuth();

  const onNavigate = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="border-b px-5 py-4">
        <h2 className="font-bold text-lg">Profile</h2>
      </div>

      <div className="p-5 border-b">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
            {(user?.name || "U").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{user?.name || "User"}</p>
            <p className="text-sm text-muted-foreground">{user?.email || "user@example.com"}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.path)}
              className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-muted/60 transition flex items-center gap-2"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            switchAuthModal("change_password");
            onClose();
          }}
          className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-muted/60 transition flex items-center gap-2"
        >
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Change Password</span>
        </button>
      </div>

      <div className="p-4 border-t">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={async () => {
            await logout();
            onClose();
            navigate("/");
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default ProfileDrawer;
