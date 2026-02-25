import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SeatMap from "@/components/domain/SeatMap";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatDateTime } from "@/lib/format";

const SeatSelectionPage = () => {
  const navigate = useNavigate();
  const { listingId, occurrenceId } = useParams();
  const { requireAuth } = useAuth();

  const [listing, setListing] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [seatMap, setSeatMap] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadSeatMap = React.useCallback(async () => {
    const response = await listingService.getSeatMap(occurrenceId);
    setSeatMap(response);
    setSelectedSeats((prev) => {
      const available = new Set(
        (response.seat_states || []).filter((seat) => seat.state === "AVAILABLE").map((seat) => seat.seat_id)
      );
      return prev.filter((seatId) => available.has(seatId));
    });
  }, [occurrenceId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([loadSeatMap(), listingService.getListingById(listingId)])
      .then(([, listingResponse]) => {
        if (!mounted) return;
        setListing(listingResponse.listing || null);
        const matched = (listingResponse.occurrences || []).find((item) => item.id === occurrenceId) || null;
        setOccurrence(matched);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load seats.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [occurrenceId, listingId, loadSeatMap]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSeatMap().catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [loadSeatMap]);

  const priceMap = useMemo(() => {
    if (Array.isArray(seatMap?.seat_layout?.categories) && seatMap.seat_layout.categories.length) {
      return Object.fromEntries(seatMap.seat_layout.categories.map((category) => [category.key, Number(category.price || 0)]));
    }
    if (seatMap?.ticket_pricing && typeof seatMap.ticket_pricing === "object") {
      return Object.fromEntries(Object.entries(seatMap.ticket_pricing).map(([key, value]) => [key, Number(value || 0)]));
    }
    return {};
  }, [seatMap]);

  const totalAmount = useMemo(
    () =>
      selectedSeats.reduce((sum, seatId) => {
        const seatState = seatMap?.seat_states?.find((entry) => entry.seat_id === seatId);
        return sum + Number(priceMap[seatState?.category] || 0);
      }, 0),
    [selectedSeats, seatMap, priceMap]
  );

  const onToggleSeat = (seatId, seatState) => {
    if (seatState.state !== "AVAILABLE") return;
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) return prev.filter((entry) => entry !== seatId);
      if (prev.length >= 6) return prev;
      return [...prev, seatId];
    });
  };

  const onContinue = async () => {
    if (!selectedSeats.length) return;
    if (!requireAuth({ type: "navigate", path: `/listings/${listingId}/occurrences/${occurrenceId}/seats` })) return;

    setSubmitting(true);
    setError("");
    try {
      const booking = await bookingService.createLock({
        occurrence_id: occurrenceId,
        seat_ids: selectedSeats,
        seat_layout_version: seatMap?.version,
      });
      if (!booking?.id || booking.id === "booking-missing") {
        throw new Error("Unable to start booking session. Please try again.");
      }
      navigate(`/checkout/${booking.id}`);
    } catch (err) {
      setError(err?.normalized?.message || err?.message || "Unable to create hold for selected seats.");
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-6 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold">Select seats</h1>
            <p className="text-xs text-muted-foreground">{selectedSeats.length} selected</p>
            {occurrence ? (
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateTime(occurrence.start_time)}
                {" • "}
                {occurrence.venue_name || listing?.venue?.name || listing?.address}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-sm font-semibold">{formatCurrency(totalAmount, "INR")}</p>
      </div>

      {listing ? (
        <div className="rounded-xl border bg-card p-4 mb-5">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {listing.venue?.name || listing.address}
            {occurrence?.provider_sub_location ? ` • ${occurrence.provider_sub_location}` : ""}
          </p>
          <h2 className="font-semibold mt-1">{listing.title}</h2>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading seat map...</p> : null}
      {!loading && seatMap ? <SeatMap seatMap={seatMap} selectedSeats={selectedSeats} onToggleSeat={onToggleSeat} /> : null}
      {error ? <p className="text-sm text-destructive mt-4">{error}</p> : null}

      <div className="fixed bottom-0 inset-x-0 border-t bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{formatCurrency(totalAmount, "INR")}</p>
          </div>
          <Button disabled={!selectedSeats.length || submitting} onClick={onContinue} className="min-w-[190px]">
            {submitting ? "Creating hold..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SeatSelectionPage;
