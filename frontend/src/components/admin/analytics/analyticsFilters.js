import dayjs from "dayjs";
import { LISTING_TYPE } from "@/lib/enums";

export const ANALYTICS_PRESET_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "mtd", label: "Month to date" },
  { value: "custom", label: "Custom range" },
];

export const ANALYTICS_INTERVAL_OPTIONS = [
  { value: "", label: "Auto interval" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export const ANALYTICS_SOURCE_DIMENSION_OPTIONS = [
  { value: "category", label: "Category" },
  { value: "listing_type", label: "Listing type" },
  { value: "city", label: "City" },
];

export const ANALYTICS_LISTING_TYPE_OPTIONS = [
  { value: "", label: "All listing types" },
  { value: LISTING_TYPE.EVENT, label: "Event" },
  { value: LISTING_TYPE.MOVIE, label: "Movie" },
  { value: LISTING_TYPE.RESTAURANT, label: "Restaurant" },
  { value: LISTING_TYPE.ACTIVITY, label: "Activity" },
];

export const ANALYTICS_DEFAULT_FILTERS = Object.freeze({
  preset: "30d",
  date_from: "",
  date_to: "",
  city_id: "",
  listing_type: "",
  interval: "",
  source_dimension: "category",
  top_n: 8,
});

const ALLOWED_PRESETS = new Set(ANALYTICS_PRESET_OPTIONS.map((option) => option.value));
const ALLOWED_INTERVALS = new Set(["", "day", "week", "month"]);
const ALLOWED_SOURCE_DIMENSIONS = new Set(
  ANALYTICS_SOURCE_DIMENSION_OPTIONS.map((option) => option.value)
);
const ALLOWED_LISTING_TYPES = new Set(["", ...ANALYTICS_LISTING_TYPE_OPTIONS.map((option) => option.value).filter(Boolean)]);

const normalizeText = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed;
};

const normalizeDateText = (value) => {
  const candidate = normalizeText(value);
  if (!candidate) return "";
  return dayjs(candidate).isValid() ? dayjs(candidate).format("YYYY-MM-DD") : "";
};

const normalizePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(25, Math.round(parsed));
};

export const parseAnalyticsFiltersFromSearch = (searchParams) => {
  const presetCandidate = normalizeText(searchParams.get("preset"));
  const preset = ALLOWED_PRESETS.has(presetCandidate)
    ? presetCandidate
    : ANALYTICS_DEFAULT_FILTERS.preset;

  const intervalCandidate = normalizeText(searchParams.get("interval"));
  const interval = ALLOWED_INTERVALS.has(intervalCandidate) ? intervalCandidate : "";

  const sourceDimensionCandidate = normalizeText(searchParams.get("source_dimension"));
  const source_dimension = ALLOWED_SOURCE_DIMENSIONS.has(sourceDimensionCandidate)
    ? sourceDimensionCandidate
    : ANALYTICS_DEFAULT_FILTERS.source_dimension;

  const listingTypeCandidate = normalizeText(searchParams.get("listing_type"));
  const listing_type = ALLOWED_LISTING_TYPES.has(listingTypeCandidate)
    ? listingTypeCandidate
    : "";

  return {
    preset,
    date_from: normalizeDateText(searchParams.get("date_from")),
    date_to: normalizeDateText(searchParams.get("date_to")),
    city_id: normalizeText(searchParams.get("city_id")),
    listing_type,
    interval,
    source_dimension,
    top_n: normalizePositiveInt(searchParams.get("top_n"), ANALYTICS_DEFAULT_FILTERS.top_n),
  };
};

export const buildDashboardAnalyticsParams = (filters) => {
  const params = {
    preset: filters.preset || ANALYTICS_DEFAULT_FILTERS.preset,
    city_id: normalizeText(filters.city_id) || undefined,
    listing_type: normalizeText(filters.listing_type) || undefined,
    interval: normalizeText(filters.interval) || undefined,
    source_dimension:
      normalizeText(filters.source_dimension) || ANALYTICS_DEFAULT_FILTERS.source_dimension,
    top_n: normalizePositiveInt(filters.top_n, ANALYTICS_DEFAULT_FILTERS.top_n),
  };

  if (params.preset === "custom") {
    params.date_from = normalizeDateText(filters.date_from) || undefined;
    params.date_to = normalizeDateText(filters.date_to) || undefined;
  }
  return params;
};

export const buildAnalyticsSearchString = (filters) => {
  const params = buildDashboardAnalyticsParams(filters);
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  return searchParams.toString();
};

export const areCustomDatesComplete = (filters) => {
  if (filters.preset !== "custom") return true;
  return Boolean(filters.date_from) && Boolean(filters.date_to);
};
