import React, { useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cityService } from "@/api/services";

const POPULAR_CITY_HINTS = [
  "mumbai",
  "delhi",
  "delhi ncr",
  "bengaluru",
  "hyderabad",
  "chennai",
  "pune",
  "kolkata",
  "ahmedabad",
  "chandigarh",
  "jaipur",
  "goa",
];

const isValidCoordinate = (value) => Number.isFinite(Number(value));

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1))
    * Math.cos(toRadians(lat2))
    * Math.sin(dLon / 2)
    * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const fetchActiveVenuesPage = async () => {
  const response = await cityService.getVenues({
    is_active: true,
    page: 1,
    page_size: 200,
  });
  return response.items || [];
};

const CityPickerDialog = ({
  cities = [],
  selectedCityId = "",
  onSelectCity,
  onRequestClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const letterRefs = useRef({});

  const sortedCities = useMemo(
    () =>
      [...cities].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      ),
    [cities]
  );

  const popularCities = useMemo(() => {
    const lowerIndex = new Map(
      sortedCities.map((city) => [String(city.name || "").toLowerCase(), city])
    );
    const picked = [];
    const pickedIds = new Set();

    POPULAR_CITY_HINTS.forEach((hint) => {
      const direct = lowerIndex.get(hint);
      if (direct && !pickedIds.has(direct.id)) {
        picked.push(direct);
        pickedIds.add(direct.id);
        return;
      }
      const partial = sortedCities.find(
        (city) =>
          !pickedIds.has(city.id)
          && String(city.name || "").toLowerCase().includes(hint)
      );
      if (partial) {
        picked.push(partial);
        pickedIds.add(partial.id);
      }
    });

    for (const city of sortedCities) {
      if (picked.length >= 12) break;
      if (!pickedIds.has(city.id)) {
        picked.push(city);
        pickedIds.add(city.id);
      }
    }
    return picked.slice(0, 12);
  }, [sortedCities]);

  const filteredCities = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return sortedCities;
    return sortedCities.filter((city) =>
      `${city.name || ""} ${city.state || ""}`.toLowerCase().includes(query)
    );
  }, [searchQuery, sortedCities]);

  const groupedCities = useMemo(() => {
    const groups = {};
    filteredCities.forEach((city) => {
      const first = String(city.name || "").trim().charAt(0).toUpperCase();
      const letter = /^[A-Z]$/.test(first) ? first : "#";
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(city);
    });
    return groups;
  }, [filteredCities]);

  const activeLetters = useMemo(
    () => Object.keys(groupedCities).sort(),
    [groupedCities]
  );

  const selectCity = (cityId) => {
    if (!cityId) return;
    if (onSelectCity) onSelectCity(cityId);
    if (onRequestClose) onRequestClose();
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Location is not supported in this browser.");
      return;
    }
    setLocating(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = Number(position.coords?.latitude);
          const lon = Number(position.coords?.longitude);
          if (!isValidCoordinate(lat) || !isValidCoordinate(lon)) {
            setLocationError("Could not read your current location.");
            setLocating(false);
            return;
          }

          const venues = await fetchActiveVenuesPage();
          let nearestCityId = "";
          let nearestDistance = Number.POSITIVE_INFINITY;

          venues.forEach((venue) => {
            const venueLat = Number(venue.latitude);
            const venueLon = Number(venue.longitude);
            if (
              !venue.city_id
              || !isValidCoordinate(venueLat)
              || !isValidCoordinate(venueLon)
            ) {
              return;
            }
            const distance = haversineKm(lat, lon, venueLat, venueLon);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestCityId = String(venue.city_id);
            }
          });

          if (!nearestCityId) {
            setLocationError("Could not match your location to an available city.");
            setLocating(false);
            return;
          }
          selectCity(nearestCityId);
        } catch {
          setLocationError("Could not detect nearest city from your location.");
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        if (error?.code === error.PERMISSION_DENIED) {
          setLocationError("Location permission denied.");
        } else {
          setLocationError("Could not access your location.");
        }
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  return (
    <DialogContent className="w-[min(96vw,980px)] max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
      <div className="flex h-full max-h-[90vh] flex-col">
        <div className="border-b bg-card px-4 py-4 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl font-semibold sm:text-2xl">
            Select Location
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Choose your city to see nearby listings and availability.
          </p>
        </div>

        <div className="border-b bg-background px-4 py-3 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search city, area or locality"
              className="h-11 pl-9 text-sm sm:text-base"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={useCurrentLocation}
            disabled={locating}
            className="mt-2 h-auto px-0 text-sm font-medium text-primary hover:bg-transparent sm:text-base"
          >
            <LocateFixed className="mr-2 h-4 w-4" />
            {locating ? "Detecting location..." : "Use Current Location"}
          </Button>
          {locationError ? (
            <p className="mt-1 text-xs text-destructive">{locationError}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-6">
            {!searchQuery.trim() ? (
              <div className="space-y-3">
                <h3 className="text-base font-semibold sm:text-lg">Popular Cities</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {popularCities.map((city) => {
                    const active = city.id === selectedCityId;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => selectCity(city.id)}
                        className={`rounded-xl border px-3 py-4 text-center transition ${active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/20 hover:bg-muted/50"
                          }`}
                      >
                        <MapPin className="mx-auto mb-2 h-5 w-5 text-primary" />
                        <p className="line-clamp-1 text-sm font-medium">{city.name}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold sm:text-lg">
                  {searchQuery.trim() ? "Search Results" : "All Cities"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {filteredCities.length} found
                </p>
              </div>

              {activeLetters.length ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {activeLetters.map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        onClick={() =>
                          letterRefs.current[letter]?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                        }
                        className="h-7 min-w-7 rounded-md border px-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      >
                        {letter}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4 pb-1">
                    {activeLetters.map((letter) => (
                      <div
                        key={letter}
                        ref={(node) => {
                          letterRefs.current[letter] = node;
                        }}
                        className="space-y-2"
                      >
                        <p className="text-sm font-semibold text-primary">{letter}</p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          {groupedCities[letter].map((city) => {
                            const active = city.id === selectedCityId;
                            return (
                              <button
                                key={city.id}
                                type="button"
                                onClick={() => selectCity(city.id)}
                                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${active
                                  ? "border-primary bg-primary/10 font-medium text-primary"
                                  : "border-border hover:bg-muted/40"
                                  }`}
                              >
                                {city.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No city matched your search.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  );
};

export default CityPickerDialog;
