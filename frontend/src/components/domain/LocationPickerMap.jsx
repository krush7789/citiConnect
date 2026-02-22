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

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const INDIA_CENTER = { latitude: 22.5937, longitude: 78.9629 };

const LocationPickerMap = ({ latitude, longitude, onChange, heightClassName = "h-72" }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const initialLatitudeRef = useRef(latitude);
  const initialLongitudeRef = useRef(longitude);
  const [error, setError] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emitChange = (nextLatitude, nextLongitude) => {
    onChangeRef.current?.({ latitude: nextLatitude, longitude: nextLongitude });
  };

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return undefined;

    let disposed = false;
    setError("");

    ensureLeafletAssets()
      .then((leaflet) => {
        if (disposed || !leaflet || !mapContainer) return;

        leafletRef.current = leaflet;
        const mapInstance = leaflet.map(mapContainer, {
          zoomControl: true,
          scrollWheelZoom: true,
        });
        mapRef.current = mapInstance;

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          })
          .addTo(mapInstance);

        const lat = toNumber(initialLatitudeRef.current);
        const lon = toNumber(initialLongitudeRef.current);
        if (lat !== null && lon !== null) {
          mapInstance.setView([lat, lon], 14);
          markerRef.current = leaflet.marker([lat, lon], { draggable: true }).addTo(mapInstance);
          markerRef.current.on("dragend", () => {
            const position = markerRef.current.getLatLng();
            emitChange(position.lat, position.lng);
          });
        } else {
          mapInstance.setView([INDIA_CENTER.latitude, INDIA_CENTER.longitude], 5);
        }

        mapInstance.on("click", (event) => {
          const nextLat = event.latlng?.lat;
          const nextLon = event.latlng?.lng;
          if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) return;

          if (!markerRef.current) {
            markerRef.current = leaflet.marker([nextLat, nextLon], { draggable: true }).addTo(mapInstance);
            markerRef.current.on("dragend", () => {
              const position = markerRef.current.getLatLng();
              emitChange(position.lat, position.lng);
            });
          } else {
            markerRef.current.setLatLng([nextLat, nextLon]);
          }
          emitChange(nextLat, nextLon);
        });

        setTimeout(() => {
          if (!disposed) mapInstance.invalidateSize();
        }, 0);
      })
      .catch(() => {
        if (!disposed) setError("Map could not be loaded right now.");
      });

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const lat = toNumber(latitude);
    const lon = toNumber(longitude);
    if (lat === null || lon === null) return;

    if (!markerRef.current && leafletRef.current) {
      markerRef.current = leafletRef.current.marker([lat, lon], { draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", () => {
        const position = markerRef.current.getLatLng();
        emitChange(position.lat, position.lng);
      });
    } else if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    }
    mapRef.current.setView([lat, lon], Math.max(13, mapRef.current.getZoom()));
  }, [latitude, longitude]);

  return (
    <div className="space-y-2">
      <div ref={mapContainerRef} className={`${heightClassName} w-full rounded-lg border`} />
      <p className="text-xs text-muted-foreground">Click map to set location. Drag marker to adjust.</p>
      {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
    </div>
  );
};

export default LocationPickerMap;
