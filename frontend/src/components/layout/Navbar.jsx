import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, MapPin, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import SearchModal from "@/components/common/SearchModal";
import ProfileDrawer from "@/components/layout/ProfileDrawer";
import { cityService } from "@/api/services";
import { getSelectedCityId, setSelectedCityId } from "@/lib/city";
import { useAuth } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";

const navItems = [
  { label: "For You", path: "/" },
  { label: "Events", path: "/events" },
  { label: "Movies", path: "/movies" },
  { label: "Dining", path: "/dining" },
  { label: "Activities", path: "/activities" },
];

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, openAuthModal } = useAuth();

  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCity] = useState(getSelectedCityId());
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isAdmin = user?.role === USER_ROLE.ADMIN;

  useEffect(() => {
    let mounted = true;
    cityService
      .getCities()
      .then((response) => {
        if (!mounted) return;
        const nextCities = response.items || [];
        setCities(nextCities);
        setSelectedCity((currentCityId) => {
          if (nextCities.some((city) => city.id === currentCityId)) {
            return currentCityId;
          }
          const fallbackCityId = nextCities[0]?.id || "";
          setSelectedCityId(fallbackCityId);
          return fallbackCityId;
        });
      })
      .catch(() => {
        if (!mounted) return;
        setCities([]);
        setSelectedCity("");
        setSelectedCityId("");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedCity = useMemo(() => cities.find((city) => city.id === selectedCityId), [cities, selectedCityId]);

  return (
    <nav className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto px-4 md:px-8">
        <div className="h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link to="/" className="leading-none">
              <p className="text-2xl font-black tracking-tight text-primary">CitiConnect</p>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <Select
                value={selectedCityId}
                onChange={(event) => {
                  setSelectedCity(event.target.value);
                  setSelectedCityId(event.target.value);
                }}
                size="sm"
                tone="subtle"
                wrapperClassName="w-[170px]"
                className="rounded-full bg-card/95 font-semibold"
              >
                {cities.length ? (
                  cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))
                ) : (
                  <option value="">No cities available</option>
                )}
              </Select>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-full text-sm transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2 sm:px-3"
                onClick={() => navigate("/admin/dashboard")}
                aria-label="Open admin dashboard"
              >
                <LayoutDashboard className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Admin Dashboard</span>
              </Button>
            ) : null}

            <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Search">
                  <Search className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent hideClose className="sm:max-w-160 p-0 border-none bg-transparent shadow-none">
                <SearchModal onClose={() => setSearchOpen(false)} />
              </DialogContent>
            </Dialog>

            {user ? (
              <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full">
                    <span className="font-semibold text-sm">{user.name.slice(0, 1).toUpperCase()}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent className="p-0 w-[320px]">
                  <ProfileDrawer onClose={() => setProfileOpen(false)} />
                </SheetContent>
              </Sheet>
            ) : (
              <Button onClick={() => openAuthModal("login")}>Login</Button>
            )}
          </div>
        </div>

        <div className="md:hidden pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground/80 border-input hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {selectedCity ? (
          <p className="hidden md:block pb-2 text-xs text-muted-foreground">
            Showing listings for {selectedCity.name}, {selectedCity.state}
          </p>
        ) : null}
      </div>
    </nav>
  );
};

export default Navbar;
