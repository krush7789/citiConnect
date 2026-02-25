import React, { useEffect, useMemo, useState } from "react";
import { MapPin, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VenueMap from "@/components/domain/VenueMap";
import { listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { LISTING_STATUS, LISTING_TYPE, OCCURRENCE_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime, toApiDateTimeMs } from "@/lib/format";

const toCoordinate = (value, min, max) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const isOccurrenceBookable = (occurrence) => {
  if (!occurrence) return false;
  if (occurrence.status !== OCCURRENCE_STATUS.SCHEDULED) return false;
  if (Number(occurrence.capacity_remaining) <= 0) return false;
  const reference = toApiDateTimeMs(occurrence.end_time || occurrence.start_time);
  return !Number.isNaN(reference) && reference >= Date.now();
};

const toMetadataRows = (listing) => {
  const metadata = listing?.metadata || {};
  if (!metadata || typeof metadata !== "object") return [];

  if (listing?.type === LISTING_TYPE.MOVIE) {
    return [
      ["Language", metadata.language],
      ["Certification", metadata.certification || metadata.rating],
      ["Duration", metadata.duration_min ? `${metadata.duration_min} mins` : null],
      ["Director", metadata.director],
      ["Cast", Array.isArray(metadata.cast) ? metadata.cast.join(", ") : null],
      ["Release Type", metadata.release_type],
    ].filter((row) => row[1]);
  }

  if (listing?.type === LISTING_TYPE.EVENT) {
    return [
      ["Genre", metadata.genre],
      ["Artists", Array.isArray(metadata.artists) ? metadata.artists.join(", ") : null],
      ["Age Restriction", metadata.age_restriction],
      ["Entry Gate", metadata.entry_gate],
      ["Reporting Time", metadata.reporting_time],
      ["Parking", metadata.parking],
    ].filter((row) => row[1]);
  }

  if (listing?.type === LISTING_TYPE.RESTAURANT) {
    return [
      ["Cuisine", metadata.cuisine],
      ["Avg cost for two", metadata.avg_cost_for_two ? formatCurrency(metadata.avg_cost_for_two, "INR") : null],
      ["Facilities", Array.isArray(metadata.features) ? metadata.features.join(", ") : null],
      ["Opening Hours", metadata.opening_hours],
      ["Dress Code", metadata.dress_code],
    ].filter((row) => row[1]);
  }

  return [
    ["Difficulty", metadata.difficulty],
    ["Duration", metadata.duration],
    ["Includes", Array.isArray(metadata.includes) ? metadata.includes.join(", ") : null],
    ["Age Limit", metadata.age_limit],
    ["What to carry", Array.isArray(metadata.what_to_carry) ? metadata.what_to_carry.join(", ") : null],
  ].filter((row) => row[1]);
};

const ListingDetailsPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();
  const { requireAuth } = useAuth();
  const [listing, setListing] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapCoordinates, setMapCoordinates] = useState(null);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const response = await listingService.getListingById(listingId);
        if (!mounted) return;
        setListing(response.listing);
        setOccurrences(response.occurrences || []);
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
    const venueLat = toCoordinate(listing?.venue?.latitude, -90, 90);
    const venueLon = toCoordinate(listing?.venue?.longitude, -180, 180);
    if (venueLat !== null && venueLon !== null) {
      setMapCoordinates({ latitude: venueLat, longitude: venueLon });
    } else {
      setMapCoordinates(null);
    }
    setLocationLoading(false);
  }, [listing?.venue?.latitude, listing?.venue?.longitude]);

  const selectedOccurrence = useMemo(() => {
    const firstBookable = occurrences.find((occurrence) => isOccurrenceBookable(occurrence));
    return firstBookable || occurrences[0] || null;
  }, [occurrences]);

  const mediaImages = useMemo(() => {
    const rawImages = [
      listing?.cover_image_url,
      ...(Array.isArray(listing?.gallery_image_urls) ? listing.gallery_image_urls : []),
    ];
    const sanitized = rawImages
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    return [...new Set(sanitized)];
  }, [listing?.cover_image_url, listing?.gallery_image_urls]);

  const canBookListing = useMemo(() => {
    if (!listing) return false;
    if (listing.status !== LISTING_STATUS.PUBLISHED) return false;

    if (listing.type === LISTING_TYPE.MOVIE) {
      return occurrences.some((occurrence) => isOccurrenceBookable(occurrence));
    }
    if (!selectedOccurrence) return false;
    return isOccurrenceBookable(selectedOccurrence);
  }, [listing, occurrences, selectedOccurrence]);

  const onBook = async () => {
    if (!listing) return;
    if (!canBookListing) return;
    const targetPath =
      listing.type === LISTING_TYPE.MOVIE
        ? `/listings/${listing.id}/showtimes`
        : `/listings/${listing.id}/occurrences`;
    if (!requireAuth({ type: "navigate", path: targetPath })) return;

    if (listing.type === LISTING_TYPE.MOVIE) {
      navigate(`/listings/${listing.id}/showtimes`);
      return;
    }
    navigate(`/listings/${listing.id}/occurrences`);
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

  const metadataRows = toMetadataRows(listing);
  const heroImage = mediaImages[0] || "";
  const mediaTitle = listing.type === LISTING_TYPE.MOVIE ? "Posters" : "Photos";

  return (
    <div className="pb-16">
      <div className="relative h-[220px] md:h-[300px] overflow-hidden">
        {heroImage ? (
          <img src={heroImage} alt={listing.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-muted/60 via-muted/30 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 container mx-auto px-4 md:px-8 pb-8">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-wide text-primary">{listing.type}</p>
            <h1 className="text-2xl md:text-4xl font-black mt-1">{listing.title}</h1>
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
          {mediaImages.length ? (
            <div className="rounded-xl border p-4 bg-card">
              <h2 className="font-semibold mb-3">{mediaTitle}</h2>
              <div className="grid grid-cols-4 gap-2 max-w-md">
                {mediaImages.slice(0, 3).map((url, index) => {
                  const isLast = index === 2;
                  const extraCount = mediaImages.length - 3;
                  const showOverlay = isLast && extraCount > 0;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-primary transition group"
                    >
                      <img
                        src={url}
                        alt={`${listing.title} ${mediaTitle.toLowerCase()} ${index + 1}`}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      {showOverlay && (
                        <span className="absolute inset-0 bg-black/50 text-white text-2xl font-bold grid place-content-center">
                          +{extraCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {previewIndex !== null && mediaImages[previewIndex] && (
            <div
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewIndex(null)}
            >
              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light z-10"
                aria-label="Close preview"
              >
                ✕
              </button>

              {mediaImages.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev > 0 ? prev - 1 : mediaImages.length - 1));
                    }}
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev < mediaImages.length - 1 ? prev + 1 : 0));
                    }}
                    aria-label="Next image"
                  >
                    ›
                  </button>
                </>
              )}

              <img
                src={mediaImages[previewIndex]}
                alt={`${listing.title} preview ${previewIndex + 1}`}
                className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />

              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                {previewIndex + 1} / {mediaImages.length}
              </p>
            </div>
          )}

          <div className="rounded-xl border p-4 bg-card">
            <h2 className="font-semibold mb-3">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{listing.description}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <p className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {listing.address}
              </p>
              <p className="inline-flex items-center gap-1">
                From {formatCurrency(listing.price_min, listing.currency)}
              </p>
            </div>
          </div>

          {metadataRows.length ? (
            <div className="rounded-xl border p-4 bg-card">
              <h2 className="font-semibold mb-3">Details</h2>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                {metadataRows.map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium mt-1">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border p-4 bg-card">
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
              <p className="text-sm text-muted-foreground">To be announced.</p>
            ) : null}
          </div>
          <div className="rounded-xl border p-4 bg-card">
            <h2 className="font-semibold mb-2">Booking slot</h2>
            <p className="text-sm text-muted-foreground">
              {selectedOccurrence
                ? `${formatDateTime(selectedOccurrence.start_time)} - ${selectedOccurrence.venue_name || listing.venue?.name || listing.address
                }`
                : "No upcoming occurrence available"}
            </p>
          </div>
        </section>

        <aside className="rounded-xl border p-4 bg-card h-fit lg:sticky lg:top-24">
          <h3 className="font-semibold">Book now</h3>
          <p className="text-sm text-muted-foreground mt-2">
            {selectedOccurrence ? formatDateTime(selectedOccurrence.start_time) : "No booking slot available"}
          </p>
          <p className="text-sm mt-1">Starting at {formatCurrency(listing.price_min, listing.currency)}</p>
          {listing.type !== LISTING_TYPE.MOVIE ? (
            <div className="mt-4 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Select occurrence, ticket type, and quantity on the next step.
              </p>
            </div>
          ) : null}
          {!canBookListing ? (
            <p className="text-xs text-destructive mt-3">
              This listing is currently not bookable. Please check again later.
            </p>
          ) : null}
          <Button className="w-full mt-4" onClick={onBook} disabled={!canBookListing}>
            {listing.type === LISTING_TYPE.MOVIE ? "Book tickets" : "Select occurrence"}
          </Button>
        </aside>
      </div>
    </div>
  );
};

export default ListingDetailsPage;
