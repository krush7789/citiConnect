import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Ticket, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bookingService, listingService, offerService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import PaymentModal from "@/components/booking/PaymentModal";
import OfferModal from "@/components/booking/OfferModal";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCountdown, formatCurrency, formatDateTime, toApiDateTimeMs } from "@/lib/format";

const normalizeToken = (value) => String(value || "").trim().toUpperCase();
const HOLD_DURATION_MS = 10 * 60 * 1000;
const computeHoldRemainingMs = (booking) => {
  if (!booking || booking.status !== BOOKING_STATUS.HOLD || !booking.hold_expires_at) {
    if (!booking || booking.status !== BOOKING_STATUS.HOLD) return null;
    const createdAtMs = toApiDateTimeMs(booking.created_at);
    if (!Number.isFinite(createdAtMs)) return null;
    return Math.max(0, createdAtMs + HOLD_DURATION_MS - Date.now());
  }

  const holdExpiryMs = toApiDateTimeMs(booking.hold_expires_at);
  const createdAtMs = toApiDateTimeMs(booking.created_at);
  const holdRemainingMs = Number.isFinite(holdExpiryMs) ? holdExpiryMs - Date.now() : Number.NEGATIVE_INFINITY;
  const fallbackRemainingMs = Number.isFinite(createdAtMs)
    ? createdAtMs + HOLD_DURATION_MS - Date.now()
    : Number.NEGATIVE_INFINITY;
  const remainingMs = Math.max(holdRemainingMs, fallbackRemainingMs);

  return Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : null;
};

const resolveSelectionPath = (booking, listing) => {
  const listingId = String(listing?.id || booking?.listing_snapshot?.listing_id || "").trim();
  const occurrenceId = String(booking?.occurrence_id || "").trim();
  const listingType = normalizeToken(listing?.type || booking?.listing_snapshot?.type);

  if (!listingId) return "/";

  if (listingType === "MOVIE" || (Array.isArray(booking?.booked_seats) && booking.booked_seats.length > 0)) {
    if (occurrenceId) return `/listings/${listingId}/occurrences/${occurrenceId}/seats`;
    return `/listings/${listingId}/showtimes`;
  }

  return `/listings/${listingId}/occurrences`;
};
let razorpayScriptPromise = null;

const ensureRazorpayScript = async () => {
  if (typeof window === "undefined") {
    throw new Error("Payment window is not available.");
  }
  if (window.Razorpay) return;

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-razorpay-checkout="true"]');
      if (existingScript) {
        if (window.Razorpay) {
          resolve();
          return;
        }
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout script.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpayCheckout = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load Razorpay checkout script."));
      document.body.appendChild(script);
    }).catch((error) => {
      razorpayScriptPromise = null;
      throw error;
    });
  }

  await razorpayScriptPromise;
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const { requireAuth, user } = useAuth();
  const idempotencyKeyRef = useRef(`idem-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);
  const sessionHandledRef = useRef(false);
  const expiryCheckRef = useRef(false);

  const [booking, setBooking] = useState(null);
  const [listing, setListing] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [availableOffers, setAvailableOffers] = useState([]);
  const [countdownMs, setCountdownMs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [offerError, setOfferError] = useState("");

  useEffect(() => {
    sessionHandledRef.current = false;
    expiryCheckRef.current = false;
  }, [bookingId]);

  const formatApplyOfferError = (error) => {
    const code = error?.normalized?.code;
    const message = error?.normalized?.message || "Unable to apply offer.";
    const details = error?.normalized?.details || {};

    if (code === "BOOKING_EXPIRED" && details.hold_expires_at) {
      return `Booking hold expired at ${formatDateTime(details.hold_expires_at)}. Recreate booking from listing page.`;
    }

    if (code === "OFFER_NOT_APPLICABLE") {
      const minOrder = Number(details.min_order_value);
      const bookingTotal = Number(details.booking_total_price);
      if (Number.isFinite(minOrder) && Number.isFinite(bookingTotal)) {
        return `Minimum order not met. Required ${formatCurrency(minOrder, booking?.currency)}, current ${formatCurrency(
          bookingTotal,
          booking?.currency
        )}.`;
      }
    }

    return message;
  };

  const handleHoldExpired = useCallback(
    async (details = {}) => {
      const expiryFromError = typeof details?.hold_expires_at === "string" ? details.hold_expires_at : null;
      setShowOfferModal(false);
      setShowPaymentModal(false);

      if (!booking?.id) {
        setBooking((prev) =>
          prev
            ? { ...prev, status: BOOKING_STATUS.EXPIRED, hold_expires_at: expiryFromError || prev.hold_expires_at }
            : prev
        );
        return;
      }

      try {
        const latest = await bookingService.getBookingById(booking.id);
        if (latest?.status === BOOKING_STATUS.EXPIRED) {
          setBooking({
            ...latest,
            hold_expires_at: latest.hold_expires_at || expiryFromError,
          });
          return;
        }
        setBooking({
          ...latest,
          status: BOOKING_STATUS.EXPIRED,
          hold_expires_at: latest?.hold_expires_at || expiryFromError || null,
        });
      } catch {
        setBooking((prev) =>
          prev
            ? { ...prev, status: BOOKING_STATUS.EXPIRED, hold_expires_at: expiryFromError || prev.hold_expires_at }
            : prev
        );
      }
    },
    [booking?.id]
  );



  const loadBooking = useCallback(async () => {
    const bookingResponse = await bookingService.getBookingById(bookingId);
    setBooking(bookingResponse);

    const fallbackOccurrence =
      bookingResponse.occurrence_start_time || bookingResponse.occurrence_end_time
        ? {
            id: bookingResponse.occurrence_id,
            start_time: bookingResponse.occurrence_start_time,
            end_time: bookingResponse.occurrence_end_time,
            venue_name: bookingResponse?.listing_snapshot?.venue_name || "",
          }
        : null;
    setOccurrence(fallbackOccurrence);

    const listingId = bookingResponse.listing_snapshot?.listing_id;
    if (!listingId) {
      setListing(null);
      return;
    }

    try {
      const listingResponse = await listingService.getListingById(listingId);
      setListing(listingResponse.listing || null);
      const occ =
        (listingResponse.occurrences || []).find(
          (item) => item.id === bookingResponse.occurrence_id
        ) || fallbackOccurrence;
      setOccurrence(occ || null);
    } catch {
      // Keep checkout working from booking snapshot when listing is archived/deleted.
      setListing(null);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: `/checkout/${bookingId}` })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setLoadError("");
    loadBooking()
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err.normalized?.message || "Unable to load checkout.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [bookingId, requireAuth, loadBooking]);

  useEffect(() => {
    if (!booking || booking.status !== BOOKING_STATUS.HOLD) {
      setCountdownMs(null);
      return undefined;
    }
    const update = () => setCountdownMs(computeHoldRemainingMs(booking));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [booking]);

  useEffect(() => {
    if (booking?.status === BOOKING_STATUS.HOLD && countdownMs !== null && countdownMs > 0) {
      expiryCheckRef.current = false;
    }
  }, [booking?.status, countdownMs]);

  const isHoldExpired = useMemo(
    () =>
      booking?.status === BOOKING_STATUS.EXPIRED ||
      (booking?.status === BOOKING_STATUS.HOLD &&
        countdownMs !== null &&
        countdownMs <= 0),
    [booking?.status, countdownMs]
  );
  const selectionPath = useMemo(() => resolveSelectionPath(booking, listing), [booking, listing]);

  useEffect(() => {
    if (!booking || booking.status !== BOOKING_STATUS.EXPIRED || sessionHandledRef.current) return;
    sessionHandledRef.current = true;

    setShowPaymentModal(false);
    setShowOfferModal(false);
    navigate(selectionPath, { replace: true });
  }, [booking, navigate, selectionPath]);

  useEffect(() => {
    if (!booking || booking.status !== BOOKING_STATUS.HOLD) return;
    if (countdownMs === null || countdownMs > 0 || expiryCheckRef.current) return;

    expiryCheckRef.current = true;
    const checkServerExpiry = async () => {
      try {
        const latest = await bookingService.getBookingById(booking.id);
        setBooking(latest);
      } catch {
        // Keep current screen state; user can retry from selection.
      }
    };
    checkServerExpiry();
  }, [booking, countdownMs]);

  const applicableOffers = useMemo(() => {
    const listingType = normalizeToken(listing?.type || booking?.listing_snapshot?.type);
    const listingCategory = normalizeToken(listing?.category);
    const listingCityId = String(listing?.city_id || booking?.listing_snapshot?.city_id || "").trim();
    const listingId = String(listing?.id || booking?.listing_snapshot?.listing_id || "").trim();
    const bookingTotal = Number(booking?.total_price || 0);

    return (availableOffers || []).filter((offer) => {
      if (!offer || offer.is_active === false || offer.is_current === false) return false;

      const minOrder = Number(offer.min_order_value);
      if (Number.isFinite(minOrder) && minOrder > bookingTotal) return false;

      const applicability = offer.applicability || {};

      const allowedTypes = Array.isArray(applicability.types)
        ? applicability.types.map((item) => normalizeToken(item)).filter(Boolean)
        : [];
      if (allowedTypes.length && (!listingType || !allowedTypes.includes(listingType))) return false;

      const allowedCategories = Array.isArray(applicability.categories)
        ? applicability.categories.map((item) => normalizeToken(item)).filter(Boolean)
        : [];
      if (allowedCategories.length && (!listingCategory || !allowedCategories.includes(listingCategory))) return false;

      const allowedCities = Array.isArray(applicability.city_ids)
        ? applicability.city_ids.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (allowedCities.length && (!listingCityId || !allowedCities.includes(listingCityId))) return false;

      const allowedListings = Array.isArray(applicability.listing_ids)
        ? applicability.listing_ids.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (allowedListings.length && (!listingId || !allowedListings.includes(listingId))) return false;

      return true;
    });
  }, [availableOffers, booking?.listing_snapshot?.listing_id, booking?.listing_snapshot?.type, booking?.total_price, listing?.category, listing?.city_id, listing?.id, listing?.type]);

  const loadApplicableOffers = useCallback(async () => {
    const listingType = normalizeToken(listing?.type || booking?.listing_snapshot?.type);
    const params = {
      page: 1,
      page_size: 100,
      current_only: true,
    };

    const cityId = listing?.city_id || booking?.listing_snapshot?.city_id;
    if (cityId) {
      params.city_id = cityId;
    }
    if (listingType) {
      params.type = listingType;
    }

    setOfferLoading(true);
    setOfferError("");
    try {
      const response = await offerService.getOffers(params);
      setAvailableOffers(response.items || []);
    } catch (err) {
      setOfferError(err?.normalized?.message || "Unable to load offers.");
    } finally {
      setOfferLoading(false);
    }
  }, [booking?.listing_snapshot?.city_id, booking?.listing_snapshot?.type, listing?.city_id, listing?.type]);

  useEffect(() => {
    if (!showOfferModal) return;
    loadApplicableOffers();
  }, [showOfferModal, loadApplicableOffers]);

  const applyOfferCode = async (offerCode) => {
    if (!booking) return;
    if (isHoldExpired) {
      setActionError("Booking hold expired. Recreate booking from the listing page.");
      return null;
    }

    setActionLoading(true);
    setActionError("");
    try {
      const latest = await bookingService.getBookingById(booking.id);
      setBooking(latest);
      const latestHoldRemainingMs = computeHoldRemainingMs(latest);
      const latestExpired =
        latest.status === BOOKING_STATUS.EXPIRED ||
        (latest.status === BOOKING_STATUS.HOLD &&
          latestHoldRemainingMs !== null &&
          latestHoldRemainingMs <= 0);
      if (latestExpired) {
        await handleHoldExpired({
          status: latest.status,
          hold_expires_at: latest.hold_expires_at,
        });
        setActionError("Booking hold expired. Recreate booking from the listing page.");
        return null;
      }

      const normalizedCode = typeof offerCode === "string" ? offerCode.trim().toUpperCase() : null;
      const updated = await bookingService.applyOffer(booking.id, normalizedCode || null);
      setBooking(updated);
      setActionError("");
      return updated;
    } catch (err) {
      if (err?.normalized?.code === "BOOKING_EXPIRED") {
        await handleHoldExpired(err?.normalized?.details || {});
      }
      setActionError(formatApplyOfferError(err));
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const onApplyOffer = async (offerCode) => {
    const updated = await applyOfferCode(offerCode);
    if (updated) {
      setShowOfferModal(false);
    }
  };

  const onClearOffer = async () => {
    await applyOfferCode(null);
  };

  const onConfirm = async () => {
    if (!booking) return;
    if (isHoldExpired) {
      setActionError("Booking hold expired. Recreate booking from the listing page.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    try {
      const latest = await bookingService.getBookingById(booking.id);
      setBooking(latest);
      const latestHoldRemainingMs = computeHoldRemainingMs(latest);
      const latestExpired =
        latest.status === BOOKING_STATUS.EXPIRED ||
        (latest.status === BOOKING_STATUS.HOLD &&
          latestHoldRemainingMs !== null &&
          latestHoldRemainingMs <= 0);
      if (latestExpired) {
        await handleHoldExpired({
          status: latest.status,
          hold_expires_at: latest.hold_expires_at,
        });
        setActionError("Booking hold expired. Recreate booking from the listing page.");
        setActionLoading(false);
        return;
      }

      const paymentOrder = await bookingService.createRazorpayOrder(latest.id);
      const orderId = String(paymentOrder?.order_id || "").trim();
      const amount = Number(paymentOrder?.amount || 0);
      const currency = String(paymentOrder?.currency || latest.currency || "INR").trim() || "INR";
      const key = String(paymentOrder?.key_id || "").trim();
      if (!orderId || !key || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Unable to initialize payment. Please try again.");
      }

      await ensureRazorpayScript();
      if (typeof window.Razorpay !== "function") {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const razorpay = new window.Razorpay({
        key,
        amount: Math.round(amount),
        currency,
        name: "CitiConnect",
        description: latest.listing_snapshot?.title || "Booking payment",
        order_id: orderId,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
        theme: { color: "#ef4444" },
        modal: {
          ondismiss: () => {
            setActionLoading(false);
          },
        },
        handler: async (paymentPayload) => {
          setActionLoading(true);
          setActionError("");
          try {
            const updated = await bookingService.confirmBooking(
              latest.id,
              { payment_method: "RAZORPAY", payment_payload: paymentPayload },
              idempotencyKeyRef.current
            );
            setBooking(updated);
            setShowOfferModal(false);
            setShowPaymentModal(false);
          } catch (err) {
            if (err?.normalized?.code === "BOOKING_EXPIRED") {
              await handleHoldExpired(err?.normalized?.details || {});
            }
            setActionError(err?.normalized?.message || "Unable to confirm booking.");
          } finally {
            setActionLoading(false);
          }
        },
      });

      razorpay.on("payment.failed", (response) => {
        const failureDescription = response?.error?.description || response?.error?.reason;
        setActionError(failureDescription || "Payment failed. Please try again.");
        setActionLoading(false);
      });

      razorpay.open();
      setActionLoading(false);
    } catch (err) {
      if (err?.normalized?.code === "BOOKING_EXPIRED") {
        await handleHoldExpired(err?.normalized?.details || {});
      }
      setActionError(err?.normalized?.message || err?.message || "Unable to initialize payment.");
      setActionLoading(false);
    }
  };

  const onReleaseHold = async () => {
    if (!booking || booking.status !== BOOKING_STATUS.HOLD) return;
    const proceed = window.confirm("Cancel this hold and release selected seats/tickets?");
    if (!proceed) return;

    setActionLoading(true);
    setActionError("");
    try {
      await bookingService.cancelBooking(booking.id, "Session cancelled by user");
      setShowPaymentModal(false);
      setShowOfferModal(false);
      sessionHandledRef.current = true;
      navigate(selectionPath, { replace: true });
    } catch (err) {
      setActionError(err?.normalized?.message || "Unable to cancel hold.");
    } finally {
      setActionLoading(false);
    }
  };

  const pricing = useMemo(() => {
    const breakdown = booking?.ticket_breakdown || {};
    const fallbackTotal = Number(booking?.total_price || 0);
    const baseFromBreakdown = Number(breakdown.base_amount);
    const taxFromBreakdown = Number(breakdown.tax_amount);

    if (Number.isFinite(baseFromBreakdown) && Number.isFinite(taxFromBreakdown)) {
      return {
        base: baseFromBreakdown,
        tax: taxFromBreakdown,
        gross: Number.isFinite(Number(breakdown.gross_amount)) ? Number(breakdown.gross_amount) : baseFromBreakdown + taxFromBreakdown,
      };
    }

    const base = fallbackTotal / 1.18;
    const tax = fallbackTotal - base;
    return { base, tax, gross: fallbackTotal };
  }, [booking]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading checkout...</p>
      </div>
    );
  }

  if (!booking || loadError) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{loadError || "Booking not found."}</p>
      </div>
    );
  }

  if (booking.status === BOOKING_STATUS.CANCELLED) {
    const cancellationReason = String(booking.cancellation_reason || "").trim();
    return (
      <div className="container mx-auto px-4 md:px-8 py-14 max-w-xl">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-500/40 dark:bg-rose-950/25">
          <h1 className="text-2xl font-black text-rose-700 dark:text-rose-200">Booking cancelled</h1>
          <p className="text-sm text-rose-700/90 dark:text-rose-200/90 mt-2">
            This occurrence was cancelled and payment cannot be completed.
          </p>
          <div className="mt-5 rounded-lg border border-rose-200/80 bg-white/65 p-4 text-left text-sm text-rose-800 dark:border-rose-500/35 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-medium">Cancellation reason</p>
            <p className="mt-1">{cancellationReason || "Occurrence cancelled by admin."}</p>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => navigate(`/bookings/${booking.id}`)}>View booking detail</Button>
            <Button variant="outline" onClick={() => navigate("/bookings")}>
              Back to bookings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-14 max-w-xl">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
          <h1 className="text-2xl font-black mt-4">Booking confirmed</h1>
          <p className="text-sm text-muted-foreground mt-2">Payment reference: {booking.payment_ref}</p>
          <div className="mt-5 rounded-lg border p-4 text-left text-sm space-y-1">
            <p className="font-medium">{booking.listing_snapshot?.title}</p>
            <p className="text-muted-foreground">
              {occurrence?.start_time
                ? formatDateTime(occurrence.start_time)
                : booking.occurrence_start_time
                  ? formatDateTime(booking.occurrence_start_time)
                  : "--"}
            </p>
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

  if (booking.status === BOOKING_STATUS.EXPIRED) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Session ended. Redirecting to selection...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-6 pb-16 max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold">Checkout</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Hold expires in{" "}
              {countdownMs === null ? "--:--" : formatCountdown(countdownMs)}
            </p>
          </div>
        </div>
        {booking.status === BOOKING_STATUS.HOLD ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReleaseHold}
            disabled={actionLoading}
            aria-label="Cancel hold"
            title="Cancel hold"
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <section className="rounded-xl border bg-card p-5 space-y-5">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-lg font-semibold">{booking.listing_snapshot?.title}</p>
          <p className="font-semibold">
            {occurrence?.start_time
              ? formatDateTime(occurrence.start_time)
              : booking.occurrence_start_time
                ? formatDateTime(booking.occurrence_start_time)
                : "--"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {occurrence?.venue_name || booking.listing_snapshot?.venue_name || booking.listing_snapshot?.address || "--"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {booking.booked_seats?.length ? `Seats: ${booking.booked_seats.join(", ")}` : `Tickets: ${booking.quantity}`}
          </p>
        </div>

        <div className="rounded-lg border p-3 space-y-2 text-sm">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Base fare</span>
            <span>{formatCurrency(pricing.base, booking.currency)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Taxes (incl.)</span>
            <span>{formatCurrency(pricing.tax, booking.currency)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(pricing.gross, booking.currency)}</span>
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

        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Choose an offer in the payment window. Only offers matching this booking category will be shown.
        </div>

        {isHoldExpired ? (
          <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive inline-flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            Your hold has expired. Recreate booking from listing page.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 inline-flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            This booking is in HOLD until payment is confirmed.
          </div>
        )}

        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <Button className="w-full" onClick={() => setShowPaymentModal(true)} disabled={actionLoading || isHoldExpired}>
          {actionLoading ? "Confirming..." : `Buy ticket ${formatCurrency(booking.final_price, booking.currency)}`}
        </Button>
      </section>

      {showPaymentModal ? (
        <PaymentModal
          booking={booking}
          listing={listing}
          actionLoading={actionLoading}
          isHoldExpired={isHoldExpired}
          onConfirm={onConfirm}
          onCancel={() => setShowPaymentModal(false)}
          onOpenOfferModal={() => {
            setOfferError("");
            setShowOfferModal(true);
          }}
          onClearOffer={onClearOffer}
        />
      ) : null}

      {showOfferModal ? (
        <OfferModal
          listing={listing}
          booking={booking}
          applicableOffers={applicableOffers}
          offerError={offerError}
          actionError={actionError}
          offerLoading={offerLoading}
          actionLoading={actionLoading}
          isHoldExpired={isHoldExpired}
          onApplyOffer={onApplyOffer}
          onClose={() => setShowOfferModal(false)}
        />
      ) : null}
    </div>
  );
};

export default CheckoutPage;
