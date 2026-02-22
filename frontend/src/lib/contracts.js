import { BOOKING_STATUS, LISTING_STATUS, LISTING_TYPE, OCCURRENCE_STATUS, USER_ROLE } from "@/lib/enums";

const fallbackDate = () => new Date().toISOString();
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const toCityName = (value) => {
  if (typeof value === "string") return value;
  if (isObject(value) && typeof value.name === "string") return value.name;
  return "";
};

const toCityId = (value) => {
  if (isObject(value) && typeof value.id === "string") return value.id;
  return "";
};

const toAddress = (value = {}) => {
  if (typeof value.address === "string" && value.address) return value.address;
  if (isObject(value.venue) && typeof value.venue.address === "string") return value.venue.address;
  return "";
};

const toMetadata = (value = {}) => {
  if (isObject(value.metadata)) return value.metadata;
  if (isObject(value.metadata_json)) return value.metadata_json;
  return {};
};

const toStringArray = (value) =>
  Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];

const toOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeUser = (value = {}) => ({
  id: value.id || "guest-user",
  name: value.name || "Guest User",
  email: value.email || "",
  role: value.role || USER_ROLE.USER,
  phone: value.phone || "",
  profile_image_url: value.profile_image_url || "",
  is_temporary_password: Boolean(value.is_temporary_password),
  is_active: value.is_active !== false,
  stats: value.stats || {
    total_bookings: 0,
    upcoming_bookings: 0,
    total_spent: 0,
  },
});

export const normalizeCity = (value = {}) => ({
  id: value.id || "city-gurugram",
  name: value.name || "Gurugram",
  state: value.state || "Haryana",
  image_url: value.image_url || "",
  is_active: value.is_active !== false,
});

export const normalizeListingCard = (value = {}) => {
  const galleryImageUrlsRaw = toStringArray(value.gallery_image_urls);
  const coverImageUrl =
    (typeof value.cover_image_url === "string" ? value.cover_image_url.trim() : "") || galleryImageUrlsRaw[0] || "";
  const galleryImageUrls = galleryImageUrlsRaw.length ? galleryImageUrlsRaw : coverImageUrl ? [coverImageUrl] : [];

  return {
    id: value.id || "listing-missing",
    type: value.type || LISTING_TYPE.EVENT,
    title: value.title || "Untitled Listing",
    description: value.description || "",
    city: toCityName(value.city) || value.city_name || "Gurugram",
    city_id: value.city_id || toCityId(value.city) || "",
    address: toAddress(value),
    timezone: value.timezone || toMetadata(value).timezone || "Asia/Kolkata",
    cover_image_url: coverImageUrl,
    gallery_image_urls: galleryImageUrls,
    price_min: Number(value.price_min || 0),
    price_max: Number(value.price_max || value.price_min || 0),
    currency: value.currency || "INR",
    category: value.category || "",
    offer_text: value.offer_text || "",
    smart_date_label: value.smart_date_label || "",
    is_wishlisted: Boolean(value.is_wishlisted),
    status: value.status || LISTING_STATUS.PUBLISHED,
    metadata: toMetadata(value),
    venue: isObject(value.venue) ? value.venue : null,
    distance_km: toOptionalNumber(value.distance_km),
    vibe_tags: Array.isArray(value.vibe_tags) ? value.vibe_tags : [],
    next_occurrence: value.next_occurrence
      ? {
        id: value.next_occurrence.id,
        start_time: value.next_occurrence.start_time || fallbackDate(),
        capacity_remaining: Number(value.next_occurrence.capacity_remaining || 0),
        status: value.next_occurrence.status || OCCURRENCE_STATUS.SCHEDULED,
      }
      : null,
  };
};

export const normalizeOccurrence = (value = {}) => ({
  id: value.id || "occurrence-missing",
  listing_id: value.listing_id || "",
  venue_id: value.venue_id || "",
  venue_name: value.venue_name || "",
  city_id: value.city_id || "",
  start_time: value.start_time || fallbackDate(),
  end_time: value.end_time || fallbackDate(),
  provider_sub_location: value.provider_sub_location || "",
  capacity_total: Number(value.capacity_total || value.capacity_remaining || 0),
  capacity_remaining: Number(value.capacity_remaining || 0),
  ticket_pricing: isObject(value.ticket_pricing) ? value.ticket_pricing : {},
  seat_layout: value.seat_layout || null,
  status: value.status || OCCURRENCE_STATUS.SCHEDULED,
});

export const normalizeBooking = (value = {}) => ({
  id: value.id || "booking-missing",
  user_id: value.user_id || "",
  occurrence_id: value.occurrence_id || "",
  listing_snapshot: value.listing_snapshot || {},
  booked_seats: value.booked_seats || [],
  ticket_breakdown: value.ticket_breakdown || {},
  quantity: Number(value.quantity || 0),
  unit_price: Number(value.unit_price || 0),
  total_price: Number(value.total_price || 0),
  discount_amount: Number(value.discount_amount || 0),
  final_price: Number(value.final_price || value.total_price || 0),
  currency: value.currency || "INR",
  status: value.status || BOOKING_STATUS.HOLD,
  payment_provider: value.payment_provider || "",
  payment_ref: value.payment_ref || "",
  cancellation_reason: value.cancellation_reason || "",
  hold_expires_at: value.hold_expires_at || null,
  can_confirm: value.can_confirm !== false,
  can_cancel: Boolean(value.can_cancel),
  cancellation_deadline: value.cancellation_deadline || null,
  created_at: value.created_at || fallbackDate(),
  updated_at: value.updated_at || fallbackDate(),
  applied_offer: value.applied_offer || null,
});

export const normalizeNotification = (value = {}) => ({
  id: value.id || "notification-missing",
  user_id: value.user_id || "",
  title: value.title || "Notification",
  body: value.body || "",
  type: value.type || "SYSTEM",
  reference_id: value.reference_id || "",
  is_read: Boolean(value.is_read),
  created_at: value.created_at || fallbackDate(),
});

export const normalizeOfferItem = (value = {}) => {
  const applicability =
    value.applicability && typeof value.applicability === "object" && !Array.isArray(value.applicability)
      ? value.applicability
      : {};
  const fromTime = new Date(value.valid_from).getTime();
  const untilTime = new Date(value.valid_until).getTime();
  const now = Date.now();
  const inferredCurrent =
    value.is_active !== false &&
    (!Number.isFinite(fromTime) || now >= fromTime) &&
    (!Number.isFinite(untilTime) || now <= untilTime);

  return {
    id: value.id || "offer-missing",
    code: String(value.code || "").trim().toUpperCase(),
    title: String(value.title || "").trim(),
    description: String(value.description || "").trim(),
    discount_type: String(value.discount_type || "FLAT").trim().toUpperCase(),
    discount_value: Number(value.discount_value || 0),
    min_order_value: value.min_order_value === null || value.min_order_value === undefined ? null : Number(value.min_order_value),
    max_discount_value: value.max_discount_value === null || value.max_discount_value === undefined ? null : Number(value.max_discount_value),
    valid_from: value.valid_from || null,
    valid_until: value.valid_until || null,
    usage_limit: value.usage_limit === null || value.usage_limit === undefined ? null : Number(value.usage_limit),
    user_usage_limit: value.user_usage_limit === null || value.user_usage_limit === undefined ? null : Number(value.user_usage_limit),
    is_active: value.is_active !== false,
    is_current: typeof value.is_current === "boolean" ? value.is_current : inferredCurrent,
    applicability,
  };
};

export const normalizePaginated = (payload = {}, normalizer = (item) => item) => {
  const items = payload.items || payload.bookings || payload.offers || payload.logs || [];
  return {
    items: items.map(normalizer),
    page: Number(payload.page || 1),
    page_size: Number(payload.page_size || payload.pageSize || 20),
    total: Number(payload.total || items.length),
    total_pages: Number(payload.total_pages || Math.max(1, Math.ceil((payload.total || items.length) / (payload.page_size || 20)))),
  };
};
