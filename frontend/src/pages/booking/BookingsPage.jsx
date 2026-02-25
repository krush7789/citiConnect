import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { bookingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime, toApiDateTimeMs } from "@/lib/format";

const scopes = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
  { label: "Cancelled", value: "cancelled" },
];
const cancelledStatuses = new Set([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.FAILED,
]);

const BookingsPage = () => {
  const navigate = useNavigate();
  const { requireAuth, isAuthenticated } = useAuth();
  const [scope, setScope] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: "/bookings" })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError("");
    bookingService
      .getBookings({ scope, page: 1, page_size: 30 })
      .then((response) => {
        if (!mounted) return;
        const rows = response.items || [];
        const nowMs = Date.now();
        const scopedRows = rows.filter((booking) => {
          if (booking.status === BOOKING_STATUS.HOLD) return false;

          const referenceMs = toApiDateTimeMs(
            booking.occurrence_end_time || booking.occurrence_start_time
          );
          const hasReferenceTime = Number.isFinite(referenceMs);

          if (scope === "past") {
            return (
              booking.status === BOOKING_STATUS.CONFIRMED &&
              hasReferenceTime &&
              referenceMs < nowMs
            );
          }

          if (scope === "cancelled") {
            return cancelledStatuses.has(booking.status);
          }

          return (
            booking.status === BOOKING_STATUS.CONFIRMED &&
            (!hasReferenceTime || referenceMs >= nowMs)
          );
        });
        setBookings(scopedRows);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load bookings.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [scope, isAuthenticated, requireAuth]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view bookings.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16">
      <h1 className="text-2xl font-bold mb-4">My bookings</h1>

      <div className="flex items-center gap-2 mb-5">
        {scopes.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={`px-3 py-1.5 rounded-full border text-xs ${
              scope === entry.value ? "bg-foreground text-white border-foreground" : ""
            }`}
            onClick={() => setScope(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading bookings...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive mb-4">{error}</p> : null}
      {!loading && bookings.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">No bookings found for this tab.</div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
            const cancellationReason = String(booking.cancellation_reason || "").trim();
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => navigate(`/bookings/${booking.id}`)}
                className="w-full text-left rounded-xl border bg-card p-4 hover:border-primary transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{booking.listing_snapshot?.type}</p>
                    <h2 className="text-lg font-semibold mt-1">{booking.listing_snapshot?.title}</h2>
                  </div>
                  <span className="text-xs border rounded-full px-2 py-1">{booking.status}</span>
                </div>

                <div className="mt-3 text-sm text-muted-foreground space-y-1">
                  <p className="inline-flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {booking.occurrence_start_time
                      ? formatDateTime(booking.occurrence_start_time)
                      : "--"}
                  </p>
                  <p>
                    Qty: {booking.quantity} | Amount: {formatCurrency(booking.final_price, booking.currency)}
                  </p>
                  {isCancelled ? (
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                      Cancellation reason: {cancellationReason || "Occurrence cancelled by admin."}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 inline-flex items-center gap-1 text-primary text-sm font-medium">
                  View details <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BookingsPage;
