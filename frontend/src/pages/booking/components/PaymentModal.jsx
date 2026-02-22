import React from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

const PaymentModal = ({
    booking,
    listing,
    actionLoading,
    isHoldExpired,
    onConfirm,
    onCancel,
    onOpenOfferModal,
    onClearOffer,
}) => {
    return (
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
                            onClick={onOpenOfferModal}
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
                    <Button variant="outline" onClick={onCancel} disabled={actionLoading}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm} disabled={actionLoading}>
                        {actionLoading ? "Processing..." : "Complete payment"}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
