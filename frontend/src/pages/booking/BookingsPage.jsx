import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime } from "@/lib/format";

const scopes = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
  { label: "Cancelled", value: "cancelled" },
];

const BookingsPage = () => {
  const navigate = useNavigate();
  const { requireAuth, isAuthenticated } = useAuth();
  const [scope, setScope] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [occurrencesById, setOccurrencesById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: "/bookings" })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    bookingService
      .getBookings({ scope, page: 1, page_size: 30 })
      .then(async (response) => {
        if (!mounted) return;
        setBookings(response.items || []);

        const uniqueListingIds = [...new Set((response.items || []).map((item) => item.listing_snapshot?.listing_id).filter(Boolean))];
        const occurrenceMap = {};
        await Promise.all(
          uniqueListingIds.map(async (listingId) => {
            const listing = await listingService.getListingById(listingId);
            (listing.occurrences || []).forEach((occ) => {
              occurrenceMap[occ.id] = occ;
            });
          })
        );
        if (mounted) setOccurrencesById(occurrenceMap);
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
      {!loading && bookings.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">No bookings found for this tab.</div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const occurrence = occurrencesById[booking.occurrence_id];
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
                    {occurrence ? formatDateTime(occurrence.start_time) : "--"}
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
