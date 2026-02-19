import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Ticket } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookingService, listingService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCountdown, formatCurrency, formatDateTime, getTimeRemainingMs } from "@/lib/format";

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const { requireAuth } = useAuth();
  const idempotencyKeyRef = useRef(`idem-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);

  const [booking, setBooking] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [countdownMs, setCountdownMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBooking = useCallback(async () => {
    const bookingResponse = await bookingService.getBookingById(bookingId);
    setBooking(bookingResponse);

    const listingId = bookingResponse.listing_snapshot?.listing_id;
    if (listingId) {
      const listingResponse = await listingService.getListingById(listingId);
      const occ = (listingResponse.occurrences || []).find((item) => item.id === bookingResponse.occurrence_id);
      setOccurrence(occ || null);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: `/checkout/${bookingId}` })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    loadBooking()
      .catch((err) => {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load checkout.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [bookingId, requireAuth, loadBooking]);

  useEffect(() => {
    if (!booking?.hold_expires_at) {
      setCountdownMs(0);
      return undefined;
    }
    const update = () => setCountdownMs(getTimeRemainingMs(booking.hold_expires_at));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [booking?.hold_expires_at]);

  const isHoldExpired = useMemo(
    () => booking?.status === BOOKING_STATUS.EXPIRED || (booking?.status === BOOKING_STATUS.HOLD && countdownMs <= 0),
    [booking?.status, countdownMs]
  );

  const onApplyCoupon = async () => {
    if (!booking) return;
    setActionLoading(true);
    setError("");
    try {
      const updated = await bookingService.applyOffer(booking.id, couponCode || null);
      setBooking(updated);
    } catch (err) {
      setError(err.normalized?.message || "Unable to apply coupon.");
    } finally {
      setActionLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!booking) return;
    setActionLoading(true);
    setError("");
    try {
      const updated = await bookingService.confirmBooking(
        booking.id,
        { payment_method: "MOCK", payment_payload: { simulate: "success" } },
        idempotencyKeyRef.current
      );
      setBooking(updated);
      setActionLoading(false);
    } catch (err) {
      setError(err.normalized?.message || "Unable to confirm booking.");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading checkout...</p>
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

  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-14 max-w-xl">
        <div className="rounded-2xl border bg-white p-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
          <h1 className="text-2xl font-black mt-4">Booking confirmed</h1>
          <p className="text-sm text-muted-foreground mt-2">Payment reference: {booking.payment_ref}</p>
          <div className="mt-5 rounded-lg border p-4 text-left text-sm space-y-1">
            <p className="font-medium">{booking.listing_snapshot?.title}</p>
            <p className="text-muted-foreground">{occurrence ? formatDateTime(occurrence.start_time, "Asia/Kolkata") : "--"}</p>
            <p className="text-muted-foreground">
              Seats: {booking.booked_seats?.length ? booking.booked_seats.join(", ") : booking.quantity}
            </p>
            <p className="font-semibold mt-1">{formatCurrency(booking.final_price, booking.currency)}</p>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => navigate(`/bookings/${booking.id}`)}>View booking detail</Button>
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-6 pb-16 max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-bold">Checkout</h1>
          <p className="text-xs text-muted-foreground">
            Hold expires in {isHoldExpired ? "00:00" : formatCountdown(countdownMs)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">{booking.listing_snapshot?.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {occurrence ? formatDateTime(occurrence.start_time, "Asia/Kolkata") : "--"}
          </p>
        </div>

        <div className="rounded-lg border p-3 space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Ticket amount</span>
            <span>{formatCurrency(booking.total_price, booking.currency)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>-{formatCurrency(booking.discount_amount, booking.currency)}</span>
          </p>
          <p className="flex justify-between font-semibold border-t pt-2">
            <span>Total payable</span>
            <span>{formatCurrency(booking.final_price, booking.currency)}</span>
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="coupon" className="text-sm font-medium">
            Apply coupon
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="coupon"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="Enter coupon code"
            />
            <Button variant="outline" onClick={onApplyCoupon} disabled={actionLoading}>
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Try WELCOME50 or LIVE200 in mock mode.</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 inline-flex items-center gap-2">
          <Ticket className="h-4 w-4" />
          {isHoldExpired ? "Your hold has expired. Recreate booking from listing page." : "This booking is in HOLD until payment is confirmed."}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button className="w-full" onClick={onConfirm} disabled={actionLoading || isHoldExpired}>
          {actionLoading ? "Confirming..." : `Pay and confirm ${formatCurrency(booking.final_price, booking.currency)}`}
        </Button>
      </div>
    </div>
  );
};

export default CheckoutPage;
