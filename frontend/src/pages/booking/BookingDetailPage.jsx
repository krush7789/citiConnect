import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCurrency, formatDateTime } from "@/lib/format";

const BookingDetailPage = () => {
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const { requireAuth, isAuthenticated } = useAuth();
  const [booking, setBooking] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: `/bookings/${bookingId}` })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    bookingService
      .getBookingById(bookingId)
      .then(async (data) => {
        if (!mounted) return;
        setBooking(data);
        const listingId = data.listing_snapshot?.listing_id;
        if (listingId) {
          const listingData = await listingService.getListingById(listingId);
          const occ = (listingData.occurrences || []).find((item) => item.id === data.occurrence_id);
          setOccurrence(occ || null);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load booking detail.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [bookingId, isAuthenticated, requireAuth]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view booking details.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading booking detail...</p>
      </div>
    );
  }

  if (!booking || error) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{error || "Booking not found."}</p>
      </div>
    );
  }
  const cancellationReason = String(booking.cancellation_reason || "").trim();

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16 max-w-3xl">
      <div className="rounded-xl border bg-card p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Booking ID</p>
            <p className="font-mono text-sm">{booking.id}</p>
            <h1 className="text-2xl font-bold mt-2">{booking.listing_snapshot?.title}</h1>
          </div>
          <span className="text-xs rounded-full border px-2.5 py-1 font-semibold">{booking.status}</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Date & Time</p>
            <p className="font-medium mt-1">{occurrence ? formatDateTime(occurrence.start_time) : "--"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Quantity</p>
            <p className="font-medium mt-1">{booking.quantity}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Seats</p>
            <p className="font-medium mt-1">{booking.booked_seats?.length ? booking.booked_seats.join(", ") : "N/A"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Final amount</p>
            <p className="font-medium mt-1">{formatCurrency(booking.final_price, booking.currency)}</p>
          </div>
        </div>

        {booking.can_cancel ? (
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            Cancellation deadline: {booking.cancellation_deadline ? formatDateTime(booking.cancellation_deadline) : "--"}
          </div>
        ) : null}

        {booking.status === BOOKING_STATUS.CANCELLED ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/25 dark:text-rose-200">
            <p className="font-semibold">This booking was cancelled.</p>
            <p className="mt-1">
              Cancellation reason: {cancellationReason || "Occurrence cancelled by admin."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/bookings")}>
            Back to bookings
          </Button>
          {booking.can_cancel && booking.status !== BOOKING_STATUS.CANCELLED ? (
            <Button
              variant="destructive"
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                await bookingService.cancelBooking(booking.id, "Plan changed");
                const refreshed = await bookingService.getBookingById(booking.id);
                setBooking(refreshed);
                setActionLoading(false);
              }}
            >
              Cancel booking
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BookingDetailPage;
