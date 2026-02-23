import React from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

const normalizeToken = (value) => String(value || "").trim().toUpperCase();

export const estimateOfferDiscount = (offer, booking) => {
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

const OfferModal = ({
    listing,
    booking,
    applicableOffers,
    offerError,
    actionError,
    offerLoading,
    actionLoading,
    isHoldExpired,
    onApplyOffer,
    onClose,
}) => {
    return (
        <div className="fixed inset-0 z-[60] grid place-content-center bg-black/55 p-4">
            <div className="w-full max-w-lg rounded-2xl border bg-card text-card-foreground p-5 space-y-4">
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
                            const estimatedDiscount = estimateOfferDiscount(offer, booking);
                            const minOrder = Number(offer.min_order_value);
                            const discountLabel =
                                normalizeToken(offer.discount_type) === "FLAT"
                                    ? `${formatCurrency(offer.discount_value, booking.currency)} OFF`
                                    : `${Number(offer.discount_value || 0)}% OFF`;

                            return (
                                <div
                                    key={offer.id}
                                    className={`rounded-lg border p-3 space-y-2 ${isApplied ? "border-emerald-400/60 bg-emerald-500/10" : ""}`}
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
                    <Button variant="outline" onClick={onClose} disabled={actionLoading}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default OfferModal;
