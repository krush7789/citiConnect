import React, { useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
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

const fetchAllActiveVenues = async () => {
  const pageSize = 200;
  const firstPage = await cityService.getVenues({
    is_active: true,
    page: 1,
    page_size: pageSize,
  });
  const totalPages = Math.max(1, Number(firstPage.total_pages || 1));
  const allItems = [...(firstPage.items || [])];

  if (totalPages <= 1) return allItems;

  const pageRequests = [];
  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      cityService.getVenues({ is_active: true, page, page_size: pageSize })
    );
  }
  const remainingPages = await Promise.all(pageRequests);
  remainingPages.forEach((response) => {
    allItems.push(...(response.items || []));
  });
  return allItems;
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

          const venues = await fetchAllActiveVenues();
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
    <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
      <div className="bg-background/95 px-6 py-5 border-b">
        <DialogTitle className="text-2xl font-semibold">Select Location</DialogTitle>
      </div>

      <div className="px-6 pb-6 pt-4 space-y-5">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search city, area or locality"
          className="h-11 text-base"
        />

        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={useCurrentLocation}
            disabled={locating}
            className="px-0 h-auto text-base font-medium hover:bg-transparent text-primary"
          >
            <LocateFixed className="h-4 w-4 mr-2" />
            {locating ? "Detecting location..." : "Use Current Location"}
          </Button>
          {locationError ? (
            <p className="text-xs text-destructive mt-1">{locationError}</p>
          ) : null}
        </div>

        {!searchQuery.trim() ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Popular Cities</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {popularCities.map((city) => {
                const active = city.id === selectedCityId;
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => selectCity(city.id)}
                    className={`rounded-xl border px-3 py-4 text-center transition ${active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:bg-muted/50"
                      }`}
                  >
                    <MapPin className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium line-clamp-1">{city.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">
            {searchQuery.trim() ? "Search Results" : "All Cities"}
          </h3>
          {activeLetters.length ? (
            <>
              <div className="flex flex-wrap gap-1">
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
                    className="h-7 min-w-7 rounded-md border px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                  >
                    {letter}
                  </button>
                ))}
              </div>

              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-4">
                {activeLetters.map((letter) => (
                  <div
                    key={letter}
                    ref={(node) => {
                      letterRefs.current[letter] = node;
                    }}
                    className="space-y-2"
                  >
                    <p className="text-sm font-semibold text-primary">{letter}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {groupedCities[letter].map((city) => {
                        const active = city.id === selectedCityId;
                        return (
                          <button
                            key={city.id}
                            type="button"
                            onClick={() => selectCity(city.id)}
                            className={`text-left rounded-lg border px-3 py-2 text-sm transition ${active
                              ? "border-primary bg-primary/10 font-medium"
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
    </DialogContent>
  );
};

export default CityPickerDialog;
