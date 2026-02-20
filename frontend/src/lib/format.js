import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatCurrency = (amount, currency = "INR") => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const formatDateTime = (isoString, timeZone) => {
  if (!isoString) return "--";
  const parsed = dayjs(isoString);
  if (!parsed.isValid()) return "--";
  const zoned = timeZone ? parsed.tz(timeZone) : parsed.tz("UTC");
  return zoned.format("ddd, DD MMM, hh:mm A");
};

export const formatDateOnly = (isoString, timeZone) => {
  if (!isoString) return "--";
  const parsed = dayjs(isoString);
  if (!parsed.isValid()) return "--";
  const zoned = timeZone ? parsed.tz(timeZone) : parsed.tz("UTC");
  return zoned.format("DD MMM YYYY");
};

export const getTimeRemainingMs = (isoExpiry) => {
  if (!isoExpiry) return 0;
  const expiry = dayjs(isoExpiry);
  if (!expiry.isValid()) return 0;
  return Math.max(0, expiry.valueOf() - dayjs().valueOf());
};

export const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const formatDistanceKm = (distanceKm) => {
  const parsed = Number(distanceKm);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  if (parsed < 1) return `${Math.max(1, Math.round(parsed * 1000))} m away`;
  return `${parsed >= 10 ? parsed.toFixed(0) : parsed.toFixed(1)} km away`;
};
