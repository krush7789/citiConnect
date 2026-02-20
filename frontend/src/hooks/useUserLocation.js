import { useEffect, useState } from "react";
import { isValidLatitude, isValidLongitude, toCoordinate } from "@/lib/geo";

const useUserLocation = (enabled) => {
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }

    if (coords) return;

    if (!navigator.geolocation) {
      setCoords(null);
      setError("Location is not supported in this browser. Showing default sorting.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const latitude = toCoordinate(position.coords?.latitude);
        const longitude = toCoordinate(position.coords?.longitude);
        if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
          setCoords(null);
          setError("Could not read your location. Showing default sorting.");
          setLoading(false);
          return;
        }
        setCoords({ latitude, longitude });
        setLoading(false);
      },
      (geoError) => {
        if (cancelled) return;
        if (geoError?.code === geoError.PERMISSION_DENIED) {
          setError("Location permission denied. Showing default sorting.");
        } else {
          setError("Could not access your location. Showing default sorting.");
        }
        setCoords(null);
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, coords]);

  return { coords, loading, error };
};

export default useUserLocation;
