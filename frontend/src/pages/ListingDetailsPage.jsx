import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VenueMap from "@/components/VenueMap";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { LISTING_STATUS, LISTING_TYPE, OCCURRENCE_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime } from "@/lib/format";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ListingDetailsPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();
  const { requireAuth } = useAuth();
  const [listing, setListing] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapCoordinates, setMapCoordinates] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const response = await listingService.getListingById(listingId);
        if (!mounted) return;
        setListing(response.listing);
        setOccurrences(response.occurrences || []);
        if (response.occurrences?.[0]) setSelectedOccurrenceId(response.occurrences[0].id);
      } catch (err) {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load listing details.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    const timer = setInterval(loadData, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [listingId]);

  useEffect(() => {
    const venueLat = toNumber(listing?.venue?.latitude);
    const venueLon = toNumber(listing?.venue?.longitude);
    if (venueLat !== null && venueLon !== null) {
      setMapCoordinates({ latitude: venueLat, longitude: venueLon });
      setLocationLoading(false);
      return undefined;
    }

    const address = String(listing?.address || "").trim();
    if (!address) {
      setMapCoordinates(null);
      setLocationLoading(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    const geocodeAddress = async () => {
      setMapCoordinates(null);
      setLocationLoading(true);
      try {
        const backendResponse = await api.get("/geocode", {
          params: { q: address },
          signal: controller.signal,
        });
        const lat = toNumber(backendResponse.data?.latitude);
        const lon = toNumber(backendResponse.data?.longitude);
        if (!cancelled && lat !== null && lon !== null) {
          setMapCoordinates({ latitude: lat, longitude: lon });
          return;
        }
      } catch {
        // Ignore and try direct Nominatim fallback.
      }

      try {
        const fallbackResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );
        const fallbackPayload = await fallbackResponse.json();
        const firstResult = Array.isArray(fallbackPayload) ? fallbackPayload[0] : null;
        const lat = toNumber(firstResult?.lat);
        const lon = toNumber(firstResult?.lon);
        if (!cancelled && lat !== null && lon !== null) {
          setMapCoordinates({ latitude: lat, longitude: lon });
          return;
        }
      } catch {
        // Ignore; map section will show fallback text.
      }

      if (!cancelled) {
        setMapCoordinates(null);
      }
    };

    geocodeAddress().finally(() => {
      if (!cancelled) setLocationLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [listing?.address, listing?.venue?.latitude, listing?.venue?.longitude]);

  const selectedOccurrence = useMemo(
    () => occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) || null,
    [occurrences, selectedOccurrenceId]
  );

  const canBookListing = useMemo(() => {
    if (!listing) return false;
    if (listing.status !== LISTING_STATUS.PUBLISHED) return false;
    if (!selectedOccurrence) return false;
    return selectedOccurrence.status === OCCURRENCE_STATUS.SCHEDULED && Number(selectedOccurrence.capacity_remaining) > 0;
  }, [listing, selectedOccurrence]);

  const onBook = async () => {
    if (!selectedOccurrence || !listing) return;
    if (!canBookListing) return;

    if (!requireAuth({ type: "navigate", path: `/listings/${listingId}` })) return;

    if (listing.type === LISTING_TYPE.MOVIE) {
      navigate(`/listings/${listing.id}/occurrences/${selectedOccurrence.id}/seats`);
      return;
    }

    setBookingLoading(true);
    try {
      const booking = await bookingService.createLock({
        occurrence_id: selectedOccurrence.id,
        quantity: 1,
        ticket_breakdown: { STANDARD: 1 },
      });
      navigate(`/checkout/${booking.id}`);
    } catch (err) {
      setError(err.normalized?.message || "Unable to create booking hold.");
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading listing details...</p>
      </div>
    );
  }

  if (!listing || error) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{error || "Listing not found."}</p>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <div className="relative h-[320px] md:h-[420px] overflow-hidden">
        <img src={listing.cover_image_url} alt={listing.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 container mx-auto px-4 md:px-8 pb-8">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-wide text-primary">{listing.type}</p>
            <h1 className="text-3xl md:text-5xl font-black mt-1">{listing.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">{listing.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{listing.category}</Badge>
              {listing.metadata?.language ? <Badge variant="secondary">{listing.metadata.language}</Badge> : null}
              {listing.metadata?.certification ? <Badge variant="secondary">{listing.metadata.certification}</Badge> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-8 mt-8 grid lg:grid-cols-[1fr_340px] gap-8">
        <section className="space-y-6">
          <div className="rounded-xl border p-4 bg-white">
            <h2 className="font-semibold mb-3">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{listing.description}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <p className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {listing.address}
              </p>
              <p className="inline-flex items-center gap-1">
                <Star className="h-4 w-4" />
                From {formatCurrency(listing.price_min, listing.currency)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-4 bg-white">
            <h2 className="font-semibold mb-3">Location map</h2>
            {mapCoordinates ? (
              <VenueMap
                latitude={mapCoordinates.latitude}
                longitude={mapCoordinates.longitude}
                title={listing.title}
                address={listing.address}
              />
            ) : null}
            {!mapCoordinates && locationLoading ? (
              <p className="text-sm text-muted-foreground">Locating venue on map...</p>
            ) : null}
            {!mapCoordinates && !locationLoading ? (
              <p className="text-sm text-muted-foreground">Map is unavailable for this listing.</p>
            ) : null}
          </div>

          <div className="rounded-xl border p-4 bg-white">
            <h2 className="font-semibold mb-3">Occurrences</h2>
            <div className="space-y-2">
              {occurrences.map((occurrence) => {
                const active = selectedOccurrenceId === occurrence.id;
                const available = occurrence.status === OCCURRENCE_STATUS.SCHEDULED && occurrence.capacity_remaining > 0;
                return (
                  <button
                    type="button"
                    key={occurrence.id}
                    onClick={() => setSelectedOccurrenceId(occurrence.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      active ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium inline-flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {formatDateTime(occurrence.start_time, listing.timezone)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Capacity left: {occurrence.capacity_remaining}</p>
                      </div>
                      <span className="text-xs border rounded-full px-2 py-1">{available ? "Available" : occurrence.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-xl border p-4 bg-white h-fit lg:sticky lg:top-24">
          <h3 className="font-semibold">Book now</h3>
          <p className="text-sm text-muted-foreground mt-2">
            {selectedOccurrence ? formatDateTime(selectedOccurrence.start_time, listing.timezone) : "Select an occurrence"}
          </p>
          <p className="text-sm mt-1">Starting at {formatCurrency(listing.price_min, listing.currency)}</p>
          {!canBookListing ? (
            <p className="text-xs text-destructive mt-3">
              This listing is currently not bookable. Choose another occurrence or check again later.
            </p>
          ) : null}
          <Button className="w-full mt-4" onClick={onBook} disabled={!canBookListing || bookingLoading}>
            {bookingLoading ? "Creating hold..." : listing.type === LISTING_TYPE.MOVIE ? "Select seats" : "Continue"}
          </Button>
        </aside>
      </div>
    </div>
  );
};

export default ListingDetailsPage;
