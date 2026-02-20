import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Ticket } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bookingService, listingService, offerService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { BOOKING_STATUS } from "@/lib/enums";
import { formatCountdown, formatCurrency, formatDateTime, getTimeRemainingMs } from "@/lib/format";

const normalizeToken = (value) => String(value || "").trim().toUpperCase();
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

  const [booking, setBooking] = useState(null);
  const [listing, setListing] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [availableOffers, setAvailableOffers] = useState([]);
  const [countdownMs, setCountdownMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [offerError, setOfferError] = useState("");

  const formatApplyOfferError = (error) => {
    const code = error?.normalized?.code;
    const message = error?.normalized?.message || "Unable to apply offer.";
    const details = error?.normalized?.details || {};

    if (code === "BOOKING_EXPIRED" && details.hold_expires_at) {
      return `Booking hold expired at ${formatDateTime(details.hold_expires_at, "Asia/Kolkata")}. Recreate booking from listing page.`;
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

  const estimateOfferDiscount = (offer) => {
    const gross = Number(booking?.total_price || 0);
    if (!Number.isFinite(gross) || gross <= 0) return 0;

    const discountType = normalizeToken(offer?.discount_type);
    const discountValue = Number(offer?.discount_value || 0);
    const maxDiscount =
      offer?.max_discount_value === null || offer?.max_discount_value === undefined
        ? Infinity
        : Number(offer.max_discount_value || 0);

    if (!Number.isFinite(discountValue) || discountValue <= 0) return 0;

    if (discountType === "FLAT") {
      return Math.max(0, Math.min(discountValue, maxDiscount));
    }

    const percentageDiscount = (gross * discountValue) / 100;
    return Math.max(0, Math.min(percentageDiscount, maxDiscount));
  };

  const loadBooking = useCallback(async () => {
    const bookingResponse = await bookingService.getBookingById(bookingId);
    setBooking(bookingResponse);

    const listingId = bookingResponse.listing_snapshot?.listing_id;
    if (listingId) {
      const listingResponse = await listingService.getListingById(listingId);
      setListing(listingResponse.listing || null);
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

  const applicableOffers = useMemo(() => {
    const listingType = normalizeToken(listing?.type || booking?.listing_snapshot?.type);
    const listingCategory = normalizeToken(listing?.category);
    const listingCityId = String(listing?.city_id || "").trim();
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

    if (listing?.city_id) {
      params.city_id = listing.city_id;
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
  }, [booking?.listing_snapshot?.type, listing?.city_id, listing?.type]);

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
      const latestExpired =
        latest.status === BOOKING_STATUS.EXPIRED ||
        (latest.status === BOOKING_STATUS.HOLD && getTimeRemainingMs(latest.hold_expires_at) <= 0);
      if (latestExpired) {
        setActionError("Booking hold expired. Recreate booking from the listing page.");
        return null;
      }

      const normalizedCode = typeof offerCode === "string" ? offerCode.trim().toUpperCase() : null;
      const updated = await bookingService.applyOffer(booking.id, normalizedCode || null);
      setBooking(updated);
      setActionError("");
      return updated;
    } catch (err) {
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
      const latestExpired =
        latest.status === BOOKING_STATUS.EXPIRED ||
        (latest.status === BOOKING_STATUS.HOLD && getTimeRemainingMs(latest.hold_expires_at) <= 0);
      if (latestExpired) {
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
      setActionError(err?.normalized?.message || err?.message || "Unable to initialize payment.");
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 inline-flex items-center gap-2">
          <Ticket className="h-4 w-4" />
          {isHoldExpired ? "Your hold has expired. Recreate booking from listing page." : "This booking is in HOLD until payment is confirmed."}
        </div>

        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <Button className="w-full" onClick={() => setShowPaymentModal(true)} disabled={actionLoading || isHoldExpired}>
          {actionLoading ? "Confirming..." : `Buy ticket ${formatCurrency(booking.final_price, booking.currency)}`}
        </Button>
      </div>

      {showPaymentModal ? (
        <div className="fixed inset-0 z-50 grid place-content-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Razorpay</p>
              <h2 className="text-xl font-bold mt-1">Complete payment</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Click complete to open Razorpay checkout and finish payment.
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(booking.total_price, booking.currency)}</span>
              </p>
              <p className="flex justify-between">
                <span>Discount</span>
                <span>-{formatCurrency(booking.discount_amount, booking.currency)}</span>
              </p>
              <p className="flex justify-between border-t pt-2 font-semibold">
                <span>Amount</span>
                <span>{formatCurrency(booking.final_price, booking.currency)}</span>
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Offers</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {booking.applied_offer?.code
                      ? `Applied: ${booking.applied_offer.code}`
                      : listing?.category
                        ? `Showing offers for ${listing.category}`
                        : "Showing applicable offers"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOfferError("");
                    setShowOfferModal(true);
                  }}
                  disabled={actionLoading || isHoldExpired}
                >
                  Select offer
                </Button>
              </div>
              {booking.applied_offer?.code ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearOffer}
                  disabled={actionLoading || isHoldExpired}
                  className="px-0 text-destructive hover:text-destructive"
                >
                  Remove applied offer
                </Button>
              ) : null}
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-semibold">{formatCurrency(booking.final_price, booking.currency)}</span>
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={actionLoading}>
                {actionLoading ? "Processing..." : "Complete payment"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showOfferModal ? (
        <div className="fixed inset-0 z-[60] grid place-content-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-white p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Offer Selector</p>
              <h2 className="text-xl font-bold mt-1">Choose an offer</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {listing?.category
                  ? `Applicable offers for category: ${listing.category}`
                  : "Applicable offers for this booking are shown below."}
              </p>
            </div>

            {offerError ? <p className="text-sm text-destructive">{offerError}</p> : null}
            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

            <div className="max-h-72 overflow-auto space-y-2 pr-1">
              {offerLoading ? <p className="text-sm text-muted-foreground">Loading offers...</p> : null}
              {!offerLoading && !applicableOffers.length ? (
                <p className="text-sm text-muted-foreground">No applicable offers available for this booking.</p>
              ) : null}
              {!offerLoading
                ? applicableOffers.map((offer) => {
                    const isApplied = booking?.applied_offer?.code === offer.code;
                    const estimatedDiscount = estimateOfferDiscount(offer);
                    const minOrder = Number(offer.min_order_value);
                    const discountLabel =
                      normalizeToken(offer.discount_type) === "FLAT"
                        ? `${formatCurrency(offer.discount_value, booking.currency)} OFF`
                        : `${Number(offer.discount_value || 0)}% OFF`;

                    return (
                      <div
                        key={offer.id}
                        className={`rounded-lg border p-3 space-y-2 ${isApplied ? "border-emerald-300 bg-emerald-50/60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{offer.code}</p>
                            <p className="text-sm text-muted-foreground">{offer.title || "Offer"}</p>
                          </div>
                          <p className="text-xs font-medium">{discountLabel}</p>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {Number.isFinite(minOrder) && minOrder > 0 ? (
                            <p>Min order: {formatCurrency(minOrder, booking.currency)}</p>
                          ) : null}
                          <p>Estimated savings: {formatCurrency(estimatedDiscount, booking.currency)}</p>
                        </div>
                        <div className="flex items-center justify-end">
                          <Button
                            size="sm"
                            variant={isApplied ? "secondary" : "outline"}
                            onClick={() => onApplyOffer(offer.code)}
                            disabled={actionLoading || isApplied || isHoldExpired}
                          >
                            {isApplied ? "Applied" : actionLoading ? "Applying..." : "Apply"}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowOfferModal(false)} disabled={actionLoading}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CheckoutPage;
