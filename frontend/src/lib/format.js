import dayjs from "dayjs";

const API_TZ_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/i;

const normalizeApiDateInput = (value) => {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!raw) return "";
  if (!raw.includes("T")) return raw;
  if (API_TZ_SUFFIX_RE.test(raw)) return raw;
  return `${raw}Z`;
};

const parseApiDate = (value) => dayjs(normalizeApiDateInput(value));

export const toApiDateTimeMs = (value) => {
  const parsed = parseApiDate(value);
  if (!parsed.isValid()) return Number.NaN;
  return parsed.valueOf();
};

export const formatCurrency = (amount, currency = "INR") => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const formatDateTime = (isoString) => {
  if (!isoString) return "--";
  const parsed = parseApiDate(isoString);
  if (!parsed.isValid()) return "--";
  return parsed.format("ddd, DD MMM, hh:mm A");
};

export const formatDateOnly = (isoString) => {
  if (!isoString) return "--";
  const parsed = parseApiDate(isoString);
  if (!parsed.isValid()) return "--";
  return parsed.format("DD MMM YYYY");
};

export const getTimeRemainingMs = (isoExpiry) => {
  const expiryMs = toApiDateTimeMs(isoExpiry);
  if (!Number.isFinite(expiryMs)) return Number.NaN;
  return Math.max(0, expiryMs - Date.now());
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
