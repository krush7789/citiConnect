import React, { useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { BookText, ClipboardList, LayoutDashboard, LogOut, MapPinned, Percent, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";
import ForbiddenPage from "@/pages/ForbiddenPage";

const navItems = [
  { name: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Listings", path: "/admin/listings", icon: Presentation },
  { name: "Cities & Venues", path: "/admin/locations", icon: MapPinned },
  { name: "Bookings", path: "/admin/bookings", icon: ClipboardList },
  { name: "Offers", path: "/admin/offers", icon: Percent },
  { name: "Audit Logs", path: "/admin/audit-logs", icon: BookText },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, requireAuth, logout } = useAuth();

  useEffect(() => {
    if (isAuthenticated) return;
    requireAuth({ type: "navigate", path: location.pathname });
  }, [isAuthenticated, location.pathname, requireAuth]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-muted/40 grid place-content-center p-6">
        <div className="rounded-lg border bg-white p-6 text-center max-w-md">
          <h1 className="text-xl font-semibold">Admin login required</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in with an admin account to access this area.</p>
        </div>
      </div>
    );
  }

  if (user?.role !== USER_ROLE.ADMIN) {
    return <ForbiddenPage />;
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-20 w-64 bg-black text-white flex flex-col p-6">
        <div className="mb-10 pl-2">
          <h2 className="text-xl font-bold tracking-tight">CitiConnect</h2>
          <span className="text-[10px] text-zinc-400 tracking-[0.2em] font-medium">ADMIN PANEL</span>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/admin/dashboard"
                ? location.pathname === item.path
                : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 hover:text-white group",
                  isActive ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-400 hover:bg-white/10"
                )}
              >
                <Icon size={18} className={cn(isActive ? "text-white" : "text-zinc-400 group-hover:text-white")} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <Button
          variant="ghost"
          className="flex justify-start gap-3 text-zinc-400 hover:text-white hover:bg-white/10 mt-auto pl-4"
          onClick={async () => {
            await logout();
            navigate("/");
          }}
        >
          <LogOut size={18} />
          <span>Logout</span>
        </Button>
      </aside>

      <main className="flex-1 ml-64 p-10 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
