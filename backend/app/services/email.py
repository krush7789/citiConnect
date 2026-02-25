from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime
from decimal import Decimal
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.errors import raise_api_error

logger = logging.getLogger(__name__)


def _smtp_is_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_port and settings.smtp_from_email)


def _sender_address() -> str:
    sender_name = (settings.smtp_from_name or settings.app_name).strip()
    return formataddr((sender_name, settings.smtp_from_email))


def _send_email_sync(message: EmailMessage) -> None:
    if not settings.smtp_host:
        raise RuntimeError("SMTP host is not configured.")

    timeout = max(1, int(settings.smtp_timeout_seconds))
    if settings.smtp_use_ssl:
        smtp_client: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.smtp_host,
            int(settings.smtp_port),
            timeout=timeout,
            context=ssl.create_default_context(),
        )
    else:
        smtp_client = smtplib.SMTP(
            settings.smtp_host,
            int(settings.smtp_port),
            timeout=timeout,
        )

    with smtp_client as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()

        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)

        smtp.send_message(message)


def _format_amount(amount: Decimal | float | int | str | None, currency: str) -> str:
    if amount is None:
        return f"{currency} 0.00"
    try:
        normalized = Decimal(str(amount)).quantize(Decimal("0.01"))
        return f"{currency} {normalized:,.2f}"
    except Exception:
        return f"{currency} {amount}"


def _format_datetime(value: datetime | None) -> str:
    if value is None:
        return "TBD"
    return value.strftime("%a, %d %b %Y %I:%M %p %Z").strip() or value.isoformat()


def _ticket_summary(ticket_breakdown: dict[str, Any] | None) -> str:
    if not isinstance(ticket_breakdown, dict):
        return "-"

    source = ticket_breakdown.get("tickets")
    if isinstance(source, dict):
        items = source.items()
    else:
        items = ticket_breakdown.items()

    parts: list[str] = []
    for key, value in items:
        try:
            qty = int(value)
        except (TypeError, ValueError):
            continue
        if qty <= 0:
            continue
        label = str(key).replace("_", " ").strip() or "TICKET"
        parts.append(f"{label}: {qty}")
    return ", ".join(parts) if parts else "-"


async def send_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    fail_silently: bool = False,
) -> bool:
    recipient = str(to_email or "").strip()
    if not recipient:
        if fail_silently:
            return False
        raise_api_error(
            422,
            "VALIDATION_ERROR",
            "Recipient email is required",
            {"fields": {"email": "Recipient email is required"}},
        )

    if not _smtp_is_configured():
        logger.warning("Email not sent because SMTP is not configured.")
        if fail_silently:
            return False
        raise_api_error(
            503,
            "EMAIL_SERVICE_UNAVAILABLE",
            "Email service is not configured",
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_address()
    message["To"] = recipient
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        await asyncio.to_thread(_send_email_sync, message)
        return True
    except Exception:
        logger.exception("Failed to send email to %s.", recipient)
        if fail_silently:
            return False
        raise_api_error(
            502,
            "EMAIL_DELIVERY_FAILED",
            "Unable to deliver email right now",
        )


async def send_forgot_password_email(
    *,
    to_email: str,
    recipient_name: str | None,
    reset_password: str,
    fail_silently: bool = False,
) -> bool:
    safe_name = escape((recipient_name or "there").strip() or "there")
    safe_password = escape(reset_password)
    safe_app_name = escape(settings.app_name)

    subject = f"{settings.app_name}: Password Reset"
    text_body = (
        f"Hello {recipient_name or 'there'},\n\n"
        f"Your new password is: {reset_password}\n\n"
        "Please log in and change your password.\n"
        "If you did not request this reset, please contact support.\n\n"
        f"- {settings.app_name}"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Password Reset Requested</h2>
        <p>Hello {safe_name},</p>
        <p>Your new password for <strong>{safe_app_name}</strong> is:</p>
        <p style="font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">{safe_password}</p>
        <p>Please log in and change your password.</p>
        <p style="color: #6b7280;">If you did not request this, please contact support.</p>
      </body>
    </html>
    """.strip()

    return await send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        fail_silently=fail_silently,
    )


async def send_booking_confirmation_email(
    *,
    to_email: str,
    recipient_name: str | None,
    booking_id: UUID,
    listing_title: str,
    venue_name: str | None,
    venue_address: str | None,
    start_time: datetime | None,
    quantity: int,
    total_amount: Decimal | float | int | str | None,
    currency: str = "INR",
    payment_provider: str | None = None,
    payment_ref: str | None = None,
    booked_seats: list[str] | None = None,
    ticket_breakdown: dict[str, Any] | None = None,
    fail_silently: bool = True,
) -> bool:
    safe_name = escape((recipient_name or "there").strip() or "there")
    safe_title = escape(str(listing_title or "Your booking"))
    safe_venue_name = escape(str(venue_name or "-"))
    safe_venue_address = escape(str(venue_address or "-"))
    safe_booking_id = escape(str(booking_id))
    safe_when = escape(_format_datetime(start_time))
    safe_amount = escape(_format_amount(total_amount, currency))
    safe_provider = escape(str(payment_provider or "-"))
    safe_payment_ref = escape(str(payment_ref or "-"))
    seat_summary = ", ".join(booked_seats or []) if booked_seats else "-"
    safe_seat_summary = escape(seat_summary)
    safe_ticket_summary = escape(_ticket_summary(ticket_breakdown))

    subject = f"{settings.app_name}: Booking Confirmed - {listing_title}"
    text_body = (
        f"Hello {recipient_name or 'there'},\n\n"
        "Your booking is confirmed.\n\n"
        f"Booking ID: {booking_id}\n"
        f"Listing: {listing_title}\n"
        f"When: {_format_datetime(start_time)}\n"
        f"Venue: {venue_name or '-'}\n"
        f"Address: {venue_address or '-'}\n"
        f"Quantity: {quantity}\n"
        f"Ticket Breakdown: {_ticket_summary(ticket_breakdown)}\n"
        f"Seats: {seat_summary}\n"
        f"Amount Paid: {_format_amount(total_amount, currency)}\n"
        f"Payment Provider: {payment_provider or '-'}\n"
        f"Payment Reference: {payment_ref or '-'}\n\n"
        f"Thank you for booking with {settings.app_name}."
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Booking Confirmed</h2>
        <p>Hello {safe_name},</p>
        <p>Your booking has been confirmed successfully.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin-top: 10px;">
          <tr><td><strong>Booking ID</strong></td><td>{safe_booking_id}</td></tr>
          <tr><td><strong>Listing</strong></td><td>{safe_title}</td></tr>
          <tr><td><strong>When</strong></td><td>{safe_when}</td></tr>
          <tr><td><strong>Venue</strong></td><td>{safe_venue_name}</td></tr>
          <tr><td><strong>Address</strong></td><td>{safe_venue_address}</td></tr>
          <tr><td><strong>Quantity</strong></td><td>{int(quantity)}</td></tr>
          <tr><td><strong>Ticket Breakdown</strong></td><td>{safe_ticket_summary}</td></tr>
          <tr><td><strong>Seats</strong></td><td>{safe_seat_summary}</td></tr>
          <tr><td><strong>Amount Paid</strong></td><td>{safe_amount}</td></tr>
          <tr><td><strong>Payment Provider</strong></td><td>{safe_provider}</td></tr>
          <tr><td><strong>Payment Reference</strong></td><td>{safe_payment_ref}</td></tr>
        </table>
        <p style="margin-top: 14px;">Thank you for booking with {escape(settings.app_name)}.</p>
      </body>
    </html>
    """.strip()

    return await send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        fail_silently=fail_silently,
    )


async def send_occurrence_cancelled_email(
    *,
    to_email: str,
    recipient_name: str | None,
    booking_id: UUID,
    listing_title: str,
    start_time: datetime | None,
    venue_name: str | None,
    venue_address: str | None,
    reason: str,
    total_amount: Decimal | float | int | str | None = None,
    currency: str = "INR",
    fail_silently: bool = True,
) -> bool:
    safe_name = escape((recipient_name or "there").strip() or "there")
    safe_booking_id = escape(str(booking_id))
    safe_title = escape(str(listing_title or "Your booking"))
    safe_when = escape(_format_datetime(start_time))
    safe_venue_name = escape(str(venue_name or "-"))
    safe_venue_address = escape(str(venue_address or "-"))
    safe_reason = escape(str(reason or "Occurrence cancelled by admin"))
    safe_amount = escape(_format_amount(total_amount, currency))

    subject = f"{settings.app_name}: Booking Cancelled - {listing_title}"
    text_body = (
        f"Hello {recipient_name or 'there'},\n\n"
        "We are sorry, but your booking has been cancelled because the occurrence was cancelled by admin.\n\n"
        f"Booking ID: {booking_id}\n"
        f"Listing: {listing_title}\n"
        f"When: {_format_datetime(start_time)}\n"
        f"Venue: {venue_name or '-'}\n"
        f"Address: {venue_address or '-'}\n"
        f"Cancellation Reason: {reason}\n"
        f"Booking Amount: {_format_amount(total_amount, currency)}\n\n"
        "If payment was completed, refund will be processed as per your payment method and policy.\n"
        f"- {settings.app_name}"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Booking Cancelled</h2>
        <p>Hello {safe_name},</p>
        <p>We are sorry, but your booking was cancelled because this occurrence was cancelled by admin.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin-top: 10px;">
          <tr><td><strong>Booking ID</strong></td><td>{safe_booking_id}</td></tr>
          <tr><td><strong>Listing</strong></td><td>{safe_title}</td></tr>
          <tr><td><strong>When</strong></td><td>{safe_when}</td></tr>
          <tr><td><strong>Venue</strong></td><td>{safe_venue_name}</td></tr>
          <tr><td><strong>Address</strong></td><td>{safe_venue_address}</td></tr>
          <tr><td><strong>Cancellation Reason</strong></td><td>{safe_reason}</td></tr>
          <tr><td><strong>Booking Amount</strong></td><td>{safe_amount}</td></tr>
        </table>
        <p style="margin-top: 14px;">
          If payment was completed, refund will be processed as per your payment method and policy.
        </p>
      </body>
    </html>
    """.strip()

    return await send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        fail_silently=fail_silently,
    )
