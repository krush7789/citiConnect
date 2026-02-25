import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { LISTING_TYPE, LISTING_STATUS, OCCURRENCE_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime, toApiDateTimeMs } from "@/lib/format";

const isBookableOccurrence = (occurrence) => {
  if (!occurrence) return false;
  if (occurrence.status !== OCCURRENCE_STATUS.SCHEDULED) return false;
  if (Number(occurrence.capacity_remaining) <= 0) return false;
  const reference = toApiDateTimeMs(occurrence.end_time || occurrence.start_time);
  return !Number.isNaN(reference) && reference >= Date.now();
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : null;
};

const OccurrenceSelectionPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();
  const { requireAuth } = useAuth();

  const [listing, setListing] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [ticketType, setTicketType] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError("");
    setActionError("");

    listingService
      .getListingById(listingId)
      .then((response) => {
        if (!mounted) return;
        const loadedListing = response.listing || null;
        if (!loadedListing) {
          setLoadError("Listing not found.");
          return;
        }
        if (loadedListing.type === LISTING_TYPE.MOVIE) {
          navigate(`/listings/${listingId}/showtimes`, { replace: true });
          return;
        }
        if (loadedListing.status !== LISTING_STATUS.PUBLISHED) {
          setLoadError("This listing is currently not bookable.");
          return;
        }

        const upcoming = (response.occurrences || []).filter(isBookableOccurrence);
        setListing(loadedListing);
        setOccurrences(upcoming);
        if (upcoming[0]) setSelectedOccurrenceId(upcoming[0].id);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err?.normalized?.message || "Unable to load occurrences.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [listingId, navigate]);

  const selectedOccurrence = useMemo(
    () => occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) || null,
    [occurrences, selectedOccurrenceId]
  );

  const ticketOptions = useMemo(() => {
    if (!selectedOccurrence?.ticket_pricing || typeof selectedOccurrence.ticket_pricing !== "object") return [];
    return Object.entries(selectedOccurrence.ticket_pricing)
      .map(([rawKey, rawPrice]) => ({
        key: String(rawKey || "").trim().toUpperCase(),
        label: String(rawKey || "").trim().replace(/_/g, " "),
        price: Number(rawPrice || 0),
      }))
      .filter((entry) => entry.key && Number.isFinite(entry.price))
      .sort((a, b) => a.price - b.price);
  }, [selectedOccurrence]);

  const selectedTicketOption = useMemo(() => {
    if (!ticketOptions.length) return null;
    return ticketOptions.find((entry) => entry.key === ticketType) || ticketOptions[0];
  }, [ticketOptions, ticketType]);

  const configuredUserLimit = useMemo(() => {
    if (!listing || listing.type !== LISTING_TYPE.EVENT) return null;
    const metadata = listing.metadata && typeof listing.metadata === "object" ? listing.metadata : {};
    const bookingConfig = metadata.booking && typeof metadata.booking === "object" ? metadata.booking : {};

    const candidates = [
      metadata.max_tickets_per_user,
      metadata.ticket_limit_per_user,
      metadata.per_user_ticket_limit,
      bookingConfig.max_tickets_per_user,
      bookingConfig.ticket_limit_per_user,
      bookingConfig.per_user_ticket_limit,
    ];

    for (const candidate of candidates) {
      const parsed = toPositiveInt(candidate);
      if (parsed) return parsed;
    }
    return null;
  }, [listing]);

  const maxTicketQuantity = useMemo(() => {
    const remaining = Number(selectedOccurrence?.capacity_remaining || 0);
    if (!Number.isFinite(remaining) || remaining <= 0) return 1;
    if (configuredUserLimit) return Math.max(1, Math.min(configuredUserLimit, remaining));
    return Math.max(1, Math.floor(remaining));
  }, [configuredUserLimit, selectedOccurrence]);

  const estimatedTotal = useMemo(() => {
    if (!selectedTicketOption) return 0;
    return selectedTicketOption.price * Math.max(1, ticketQuantity);
  }, [selectedTicketOption, ticketQuantity]);

  useEffect(() => {
    setTicketQuantity((prev) => {
      const safePrev = Number.isFinite(Number(prev)) ? Number(prev) : 1;
      return Math.max(1, Math.min(maxTicketQuantity, safePrev));
    });

    if (ticketOptions.length) {
      setTicketType((prev) => (ticketOptions.some((entry) => entry.key === prev) ? prev : ticketOptions[0].key));
    } else {
      setTicketType("");
    }
  }, [maxTicketQuantity, ticketOptions]);

  const onCreateHold = async () => {
    if (!selectedOccurrence) return;
    if (!requireAuth({ type: "navigate", path: `/listings/${listingId}/occurrences` })) return;
    const quantity = Math.max(1, Math.min(maxTicketQuantity, Number(ticketQuantity || 1)));
    const selectedTier = selectedTicketOption?.key || "STANDARD";

    setSubmitting(true);
    setActionError("");
    try {
      const booking = await bookingService.createLock({
        occurrence_id: selectedOccurrence.id,
        quantity,
        ticket_breakdown: { [selectedTier]: quantity },
      });
      if (!booking?.id || booking.id === "booking-missing") {
        throw new Error("Unable to start booking session. Please try again.");
      }
      navigate(`/checkout/${booking.id}`);
    } catch (err) {
      setActionError(err?.normalized?.message || err?.message || "Unable to create booking hold.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading occurrences...</p>
      </div>
    );
  }

  if (!listing || loadError) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{loadError || "Unable to load occurrences."}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-6 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/listings/${listingId}`)} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Select occurrence</h1>
          <p className="text-sm text-muted-foreground">{listing.title}</p>
        </div>
      </div>

      <section className="space-y-3">
        {occurrences.length === 0 ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No upcoming occurrences are available for this listing.
          </div>
        ) : (
          occurrences.map((occurrence) => {
            const active = occurrence.id === selectedOccurrenceId;
            return (
              <button
                type="button"
                key={occurrence.id}
                onClick={() => setSelectedOccurrenceId(occurrence.id)}
                className={`w-full text-left rounded-xl border bg-card p-4 transition ${
                  active
                    ? "border-primary/55 bg-primary/[0.04] shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]"
                    : "hover:border-primary/35"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatDateTime(occurrence.start_time)}</p>
                    <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {occurrence.venue_name || listing.venue?.name || listing.address}
                    </p>
                    {occurrence.provider_sub_location ? (
                      <p className="text-xs text-muted-foreground mt-1">{occurrence.provider_sub_location}</p>
                    ) : null}
                  </div>
                  <span className={`text-xs border rounded-full px-2 py-1 ${active ? "border-primary/35 bg-primary/10" : ""}`}>
                    {occurrence.capacity_remaining} slots left
                  </span>
                </div>
              </button>
            );
          })
        )}
      </section>

      {selectedOccurrence ? (
        <div className="mt-5 max-w-4xl rounded-xl border bg-card p-3 sm:p-4 space-y-3">
          {ticketOptions.length ? (
            <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
              <div className="space-y-1">
                <label htmlFor="ticket-tier" className="text-xs font-medium text-muted-foreground">
                  Ticket type
                </label>
                <Select
                  id="ticket-tier"
                  value={selectedTicketOption?.key || ""}
                  onChange={(event) => setTicketType(event.target.value)}
                  size="sm"
                  tone="subtle"
                  className="font-medium focus-visible:ring-1 focus-visible:ring-primary/15 focus-visible:ring-offset-0"
                  iconClassName="peer-focus-visible:text-muted-foreground"
                >
                  {ticketOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} - {formatCurrency(option.price, listing.currency)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/25 px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Capacity left</p>
                <p className="text-base font-semibold leading-5">{selectedOccurrence.capacity_remaining}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Single ticket pricing applies for this listing.</p>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Quantity</p>
            <div className="inline-flex items-center rounded-full border border-input bg-background p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setTicketQuantity((prev) => Math.max(1, Number(prev || 1) - 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-input bg-muted/30 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={ticketQuantity <= 1}
              >
                -
              </button>
              <span className="min-w-10 px-2.5 text-center text-sm font-semibold">{ticketQuantity}</span>
              <button
                type="button"
                onClick={() => setTicketQuantity((prev) => Math.min(maxTicketQuantity, Number(prev || 1) + 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-input bg-muted/30 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={ticketQuantity >= maxTicketQuantity}
              >
                +
              </button>
            </div>
            {configuredUserLimit ? (
              <p className="text-[11px] text-muted-foreground">Select between 1 and {maxTicketQuantity} tickets.</p>
            ) : null}
          </div>

          {selectedTicketOption ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Estimated total</p>
              <p className="text-base font-semibold">{formatCurrency(estimatedTotal, listing.currency)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {actionError ? <p className="text-sm text-destructive mt-4">{actionError}</p> : null}

      <div className="fixed bottom-0 inset-x-0 border-t bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Selected occurrence</p>
            <p className="text-sm font-medium">
              {selectedOccurrence ? formatDateTime(selectedOccurrence.start_time) : "None"}
            </p>
          </div>
          <Button disabled={!selectedOccurrence || submitting} onClick={onCreateHold} className="min-w-[190px]">
            {submitting ? "Creating hold..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OccurrenceSelectionPage;
