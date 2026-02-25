import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listingService } from "@/api/services";
import { LISTING_TYPE, OCCURRENCE_STATUS } from "@/lib/enums";
import { toApiDateTimeMs } from "@/lib/format";

const isBookableOccurrence = (occurrence) => {
  if (!occurrence) return false;
  if (occurrence.status !== OCCURRENCE_STATUS.SCHEDULED) return false;
  if (Number(occurrence.capacity_remaining) <= 0) return false;
  const reference = toApiDateTimeMs(occurrence.end_time || occurrence.start_time);
  return !Number.isNaN(reference) && reference >= Date.now();
};

const toLocalDateKey = (timestampMs) => {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const toTimeLabel = (isoString) => {
  const timestamp = toApiDateTimeMs(isoString);
  if (!Number.isFinite(timestamp)) return "--";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).format(timestamp);
};

const capacityMeta = (occurrence) => {
  const remaining = Math.max(0, Number(occurrence?.capacity_remaining || 0));
  const total = Math.max(0, Number(occurrence?.capacity_total || 0));
  if (!total) return { label: `${remaining} seats left`, className: "text-muted-foreground" };

  const ratio = remaining / total;
  if (ratio <= 0.15) return { label: `${remaining} left | Almost full`, className: "text-rose-600" };
  if (ratio <= 0.4) return { label: `${remaining} left | Filling fast`, className: "text-amber-600" };
  return { label: `${remaining} left | Available`, className: "text-emerald-600" };
};

const MovieShowtimesPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();

  const [listing, setListing] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listingService
      .getListingById(listingId)
      .then((response) => {
        if (!mounted) return;
        if (response.listing?.type !== LISTING_TYPE.MOVIE) {
          navigate(`/listings/${listingId}`, { replace: true });
          return;
        }

        const upcoming = (response.occurrences || []).filter(isBookableOccurrence);
        setListing(response.listing);
        setOccurrences(upcoming);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load movie showtimes.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [listingId, navigate]);

  const dateOptions = useMemo(() => {
    const dateMap = new Map();
    occurrences.forEach((occurrence) => {
      const timestamp = toApiDateTimeMs(occurrence.start_time);
      if (!Number.isFinite(timestamp)) return;
      const key = toLocalDateKey(timestamp);
      if (!dateMap.has(key)) {
        const date = new Date(timestamp);
        dateMap.set(key, {
          key,
          timestamp,
          dateValue: date.getDate(),
          weekdayLabel: date.toLocaleDateString("en-IN", { weekday: "short" }),
          monthLabel: date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
          longLabel: date.toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
        });
      }
    });
    return Array.from(dateMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [occurrences]);

  useEffect(() => {
    if (!dateOptions.length) {
      setSelectedDateKey("");
      return;
    }
    setSelectedDateKey((current) => {
      if (current && dateOptions.some((option) => option.key === current)) return current;
      return dateOptions[0].key;
    });
  }, [dateOptions]);

  const selectedDateOption = useMemo(
    () => dateOptions.find((option) => option.key === selectedDateKey) || null,
    [dateOptions, selectedDateKey]
  );

  const visibleOccurrences = useMemo(
    () =>
      occurrences
        .filter((occurrence) => {
          const timestamp = toApiDateTimeMs(occurrence.start_time);
          if (!Number.isFinite(timestamp) || !selectedDateKey) return false;
          return toLocalDateKey(timestamp) === selectedDateKey;
        })
        .sort((left, right) => toApiDateTimeMs(left.start_time) - toApiDateTimeMs(right.start_time)),
    [occurrences, selectedDateKey]
  );

  useEffect(() => {
    setSelectedOccurrenceId((current) => {
      if (!visibleOccurrences.length) return "";
      if (visibleOccurrences.some((occurrence) => occurrence.id === current)) return current;
      return visibleOccurrences[0].id;
    });
  }, [visibleOccurrences]);

  const selectedOccurrence = useMemo(
    () => occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) || null,
    [occurrences, selectedOccurrenceId]
  );

  const groupedOccurrences = useMemo(() => {
    const groups = new Map();
    visibleOccurrences.forEach((occurrence) => {
      const venueName = occurrence.venue_name || listing?.venue?.name || listing?.address || "Venue";
      const key = String(venueName).trim() || "Venue";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          venueName: key,
          items: [],
        });
      }
      groups.get(key).items.push(occurrence);
    });
    return Array.from(groups.values());
  }, [visibleOccurrences, listing]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading showtimes...</p>
      </div>
    );
  }

  if (!listing || error) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{error || "Unable to load showtimes."}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 md:px-8 py-6 pb-24">
      <div className="flex items-start gap-3 md:gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/listings/${listingId}`)} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-24 w-20 rounded-xl overflow-hidden border bg-muted shrink-0">
          {listing.cover_image_url ? (
            <img src={listing.cover_image_url} alt={listing.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {listing.title?.slice(0, 1) || "M"}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{listing.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {listing.category || "Movie"} | {listing.city?.name || "City"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {listing.venue?.name || listing.address}
          </p>
        </div>
      </div>

      {dateOptions.length ? (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {dateOptions.map((dateOption) => {
              const active = dateOption.key === selectedDateKey;
              return (
                <button
                  key={dateOption.key}
                  type="button"
                  onClick={() => setSelectedDateKey(dateOption.key)}
                  className={`min-w-[62px] rounded-lg border px-2.5 py-1.5 text-left transition ${active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card hover:border-input"
                  }`}
                >
                  <p className={`text-[9px] uppercase tracking-wide ${active ? "text-background/80" : "text-muted-foreground"}`}>
                    {dateOption.monthLabel}
                  </p>
                  <p className="text-lg font-semibold leading-none mt-0.5">{dateOption.dateValue}</p>
                  <p className={`text-xs mt-0.5 ${active ? "text-background/90" : "text-muted-foreground"}`}>
                    {dateOption.weekdayLabel}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="rounded-md border border-sky-300/70 bg-sky-100 px-4 py-2 text-sm text-slate-700">
            <span className="font-medium">Advance bookings open for shows on </span>
            <span className="font-semibold">{selectedDateOption?.longLabel || "selected day"}.</span>
          </div>
        </div>
      ) : null}

      <section className="mt-5 space-y-4">
        {visibleOccurrences.length === 0 ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No upcoming showtimes available for this date.
          </div>
        ) : (
          groupedOccurrences.map((group) => (
            <div key={group.key} className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold">{group.venueName}</p>
                  <p className="text-sm text-muted-foreground mt-1">{listing.address}</p>
                </div>
                <span className="text-xs rounded-full border px-2 py-1 text-muted-foreground">
                  {group.items.length} showtime{group.items.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((occurrence) => {
                  const active = occurrence.id === selectedOccurrenceId;
                  const capacity = capacityMeta(occurrence);
                  return (
                    <button
                      key={occurrence.id}
                      type="button"
                      onClick={() => setSelectedOccurrenceId(occurrence.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${active
                        ? "border-input bg-muted/40"
                        : "bg-background hover:border-foreground/25"
                      }`}
                    >
                      <p className="text-2xl font-semibold leading-none">{toTimeLabel(occurrence.start_time)}</p>
                      <p className={`text-xs mt-2 ${capacity.className}`}>{capacity.label}</p>
                      {occurrence.provider_sub_location ? (
                        <p className="text-xs text-muted-foreground mt-1">{occurrence.provider_sub_location}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      <div className="fixed bottom-0 inset-x-0 border-t bg-card px-4 py-3">
        <div className="container mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Selected showtime</p>
            <p className="text-sm font-medium">{selectedOccurrence ? toTimeLabel(selectedOccurrence.start_time) : "None"}</p>
          </div>
          <Button
            disabled={!selectedOccurrence}
            onClick={() => navigate(`/listings/${listingId}/occurrences/${selectedOccurrence.id}/seats`)}
            className="min-w-[190px]"
          >
            Select seats
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MovieShowtimesPage;
