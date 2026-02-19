const dateFormatterCache = new Map();

const getFormatter = (timeZone, opts) => {
  const key = JSON.stringify([timeZone || "UTC", opts]);
  if (!dateFormatterCache.has(key)) {
    dateFormatterCache.set(
      key,
      new Intl.DateTimeFormat("en-IN", {
        timeZone: timeZone || "UTC",
        ...opts,
      })
    );
  }
  return dateFormatterCache.get(key);
};

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
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "--";
  return getFormatter(timeZone, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatDateOnly = (isoString, timeZone) => {
  if (!isoString) return "--";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "--";
  return getFormatter(timeZone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const getTimeRemainingMs = (isoExpiry) => {
  if (!isoExpiry) return 0;
  const expiry = new Date(isoExpiry).getTime();
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, expiry - Date.now());
};

export const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
