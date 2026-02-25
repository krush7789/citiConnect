import React, { useEffect, useRef, useState } from "react";

const LEAFLET_SCRIPT_ID = "citiconnect-leaflet-script";
const LEAFLET_STYLE_ID = "citiconnect-leaflet-style";
const LEAFLET_SCRIPT_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_STYLE_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

const ensureLeafletAssets = () =>
  new Promise((resolve, reject) => {
    if (globalThis.L) {
      resolve(globalThis.L);
      return;
    }

    if (!document.getElementById(LEAFLET_STYLE_ID)) {
      const style = document.createElement("link");
      style.id = LEAFLET_STYLE_ID;
      style.rel = "stylesheet";
      style.href = LEAFLET_STYLE_URL;
      document.head.appendChild(style);
    }

    const existingScript = document.getElementById(LEAFLET_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalThis.L), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Leaflet")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(globalThis.L);
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(script);
  });

const toCoordinate = (value, min, max) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const VenueMap = ({ latitude, longitude, title, address, zoom = 15 }) => {
  const mapContainerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const lat = toCoordinate(latitude, -90, 90);
    const lon = toCoordinate(longitude, -180, 180);
    if (lat === null || lon === null) return undefined;

    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return undefined;

    let disposed = false;
    let mapInstance = null;

    setError("");
    ensureLeafletAssets()
      .then((leaflet) => {
        if (disposed || !leaflet || !mapContainer) return;

        mapInstance = leaflet.map(mapContainer, {
          zoomControl: true,
          scrollWheelZoom: false,
        });
        mapInstance.setView([lat, lon], zoom);

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          })
          .addTo(mapInstance);

        const marker = leaflet.marker([lat, lon]).addTo(mapInstance);
        const popupText = title || address;
        if (popupText) marker.bindPopup(String(popupText)).openPopup();

        setTimeout(() => {
          if (!disposed) mapInstance?.invalidateSize();
        }, 0);
      })
      .catch(() => {
        if (!disposed) setError("Map could not be loaded right now.");
      });

    return () => {
      disposed = true;
      if (mapInstance) mapInstance.remove();
    };
  }, [address, latitude, longitude, title, zoom]);

  return (
    <div className="space-y-2">
      <div ref={mapContainerRef} className="h-64 w-full rounded-lg border" />
      {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
    </div>
  );
};

export default VenueMap;
