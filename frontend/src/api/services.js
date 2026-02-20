import api, { createError, getStoredToken } from "@/api/client";
import {
  initialMockBookings,
  initialMockNotifications,
  initialMockWishlist,
  mockAdminUser,
  mockArtists,
  mockCities,
  mockListings,
  mockOccurrences,
  mockOffers,
  mockUser,
  mockVenues,
} from "@/api/mockData";
import { normalizeBooking, normalizeCity, normalizeListingCard, normalizeNotification, normalizeOccurrence, normalizePaginated, normalizeUser } from "@/lib/contracts";
import { BOOKING_STATUS, LISTING_STATUS, LISTING_TYPE, OCCURRENCE_STATUS, USER_ROLE } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { haversineDistanceKm, toCoordinate } from "@/lib/geo";

const FORCE_MOCK = import.meta.env.VITE_FORCE_MOCK === "true";

const STORE_KEYS = {
  BOOKINGS: "citiconnect_mock_bookings",
  WISHLIST: "citiconnect_mock_wishlist",
  NOTIFICATIONS: "citiconnect_mock_notifications",
  OFFER_USAGE: "citiconnect_mock_offer_usage",
  IDEMPOTENCY: "citiconnect_mock_idempotency",
  ADMIN_CITIES: "citiconnect_mock_admin_cities",
  ADMIN_VENUES: "citiconnect_mock_admin_venues",
  ADMIN_LISTINGS: "citiconnect_mock_admin_listings",
  ADMIN_OCCURRENCES: "citiconnect_mock_admin_occurrences",
  ADMIN_OFFERS: "citiconnect_mock_admin_offers",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeQueryParams = (params = {}, { uuidKeys = [] } = {}) => {
  const uuidKeySet = new Set(uuidKeys);

  return Object.entries(params).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return acc;
      if (uuidKeySet.has(key) && !UUID_PATTERN.test(trimmed)) return acc;
      acc[key] = trimmed;
      return acc;
    }

    if (uuidKeySet.has(key)) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

const safeJsonParse = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const getState = (key, fallback) => safeJsonParse(localStorage.getItem(key), fallback);
const setState = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const getCollectionState = (key, fallback) => {
  const existing = getState(key, null);
  if (existing) return existing;
  const seeded = JSON.parse(JSON.stringify(fallback));
  setState(key, seeded);
  return seeded;
};

const getCitiesState = () => getCollectionState(STORE_KEYS.ADMIN_CITIES, mockCities);
const getVenuesState = () => getCollectionState(STORE_KEYS.ADMIN_VENUES, mockVenues);

const getListingsState = () => getCollectionState(STORE_KEYS.ADMIN_LISTINGS, mockListings);
const seededOccurrenceLayouts = Object.fromEntries(
  mockOccurrences
    .filter((occurrence) => occurrence?.id && occurrence?.seat_layout)
    .map((occurrence) => [occurrence.id, occurrence.seat_layout])
);

const syncOccurrenceSeatLayouts = (occurrences) => {
  if (!Array.isArray(occurrences)) return { items: [], mutated: false };
  let mutated = false;
  const items = occurrences.map((occurrence) => {
    const seededLayout = seededOccurrenceLayouts[occurrence?.id];
    if (!seededLayout || occurrence?.seat_layout) return occurrence;
    mutated = true;
    return { ...occurrence, seat_layout: JSON.parse(JSON.stringify(seededLayout)) };
  });
  return { items, mutated };
};

const getOccurrencesState = () => {
  const existing = getCollectionState(STORE_KEYS.ADMIN_OCCURRENCES, mockOccurrences);
  const { items, mutated } = syncOccurrenceSeatLayouts(existing);
  if (mutated) setState(STORE_KEYS.ADMIN_OCCURRENCES, items);
  return items;
};
const getOffersState = () => getCollectionState(STORE_KEYS.ADMIN_OFFERS, mockOffers);

const withFallback = async (liveHandler, mockHandler, options = {}) => {
  if (FORCE_MOCK) return mockHandler();
  try {
    return await liveHandler();
  } catch (error) {
    const allowRuntimeFallback = options.allowRuntimeFallback === true;
    if (!allowRuntimeFallback) {
      throw normalizeServiceError(error);
    }

    const status = error?.response?.status;
    const fallbackStatuses = options.fallbackStatuses || [404, 500, 502, 503, 504];
    if (!error?.response || fallbackStatuses.includes(status)) return mockHandler();
    throw normalizeServiceError(error);
  }
};

const normalizeServiceError = (error) => {
  if (error?.normalized) return error;
  const envelope = error?.response?.data?.error;
  return createError(envelope?.code || "REQUEST_FAILED", envelope?.message || error?.message || "Request failed", envelope?.details || {});
};

const adminLiveCall = async (liveHandler, transform = (data) => data) => {
  try {
    const response = await liveHandler();
    return transform(response?.data, response);
  } catch (error) {
    throw normalizeServiceError(error);
  }
};

const adminPaginatedCall = (liveHandler) => adminLiveCall(liveHandler, (data) => normalizePaginated(data, (item) => item));

const nowIso = () => new Date().toISOString();
const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const isPresent = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const USER_ME_CACHE_TTL_MS = 15 * 1000;
let userMeInFlight = null;
let userMeCache = {
  token: "",
  user: null,
  fetchedAt: 0,
};

const readUserMeCache = () => {
  const token = getStoredToken() || "";
  if (!token) return null;
  if (!userMeCache.user) return null;
  if (userMeCache.token !== token) return null;
  if (Date.now() - Number(userMeCache.fetchedAt || 0) > USER_ME_CACHE_TTL_MS) return null;
  return userMeCache.user;
};

const writeUserMeCache = (user) => {
  const token = getStoredToken() || "";
  if (!token || !user) {
    userMeCache = { token: "", user: null, fetchedAt: 0 };
    return;
  }
  userMeCache = {
    token,
    user,
    fetchedAt: Date.now(),
  };
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected file"));
    reader.readAsDataURL(file);
  });

const getCurrentUser = () => safeJsonParse(localStorage.getItem("citiconnect_user"), null);
const getCurrentUserId = () => getCurrentUser()?.id || mockUser.id;

const isBookingExpired = (booking) =>
  booking.status === BOOKING_STATUS.HOLD && booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() <= Date.now();

const applyBookingExpiry = (bookings) =>
  bookings.map((booking) => (isBookingExpired(booking) ? { ...booking, status: BOOKING_STATUS.EXPIRED, can_confirm: false } : booking));

const listOccurrencesByListing = (listingId) => getOccurrencesState().filter((occ) => occ.listing_id === listingId);
const findOccurrence = (occurrenceId) => getOccurrencesState().find((occ) => occ.id === occurrenceId);
const findListing = (listingId) => getListingsState().find((listing) => listing.id === listingId);

const listingWithComputedFields = (listing, userWishlist) => {
  const venue = getVenuesState().find((item) => item.id === listing.venue_id);
  const occurrences = listOccurrencesByListing(listing.id).filter((occ) => occ.status === OCCURRENCE_STATUS.SCHEDULED);
  const sorted = [...occurrences].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const nextOccurrence = sorted[0] || null;
  return normalizeListingCard({
    ...listing,
    address: listing.address || venue?.address || "",
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          latitude: venue.latitude,
          longitude: venue.longitude,
        }
      : listing.venue,
    city: getCitiesState().find((city) => city.id === listing.city_id)?.name || listing.city || "Gurugram",
    is_wishlisted: userWishlist.includes(listing.id),
    smart_date_label: nextOccurrence ? formatDateTime(nextOccurrence.start_time, listing.timezone) : listing.smart_date_label,
    next_occurrence: nextOccurrence
      ? {
          id: nextOccurrence.id,
          start_time: nextOccurrence.start_time,
          capacity_remaining: nextOccurrence.capacity_remaining,
          status: nextOccurrence.status,
        }
      : null,
  });
};

const seatCategoryForRow = (layout, rowLabel) => {
  const category = layout.categories.find((cat) => cat.rows?.includes(rowLabel));
  return category?.key || layout.categories[layout.categories.length - 1]?.key || "SILVER";
};

const buildSeatMap = (occurrenceId) => {
  const occurrence = findOccurrence(occurrenceId);
  if (!occurrence) throw createError("NOT_FOUND", "Occurrence not found");

  const layout =
    occurrence.seat_layout || {
      rows: ["A", "B", "C", "D", "E", "F", "G", "H"],
      columns: 12,
      categories: [
        { key: "RECLINER", price: 450, color: "#f59e0b", rows: ["A", "B"] },
        { key: "GOLD", price: 320, color: "#3b82f6", rows: ["C", "D", "E"] },
        { key: "SILVER", price: 220, color: "#22c55e", rows: ["F", "G", "H"] },
      ],
    };

  const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
  setState(STORE_KEYS.BOOKINGS, bookings);

  const heldSeats = new Set(
    bookings
      .filter((booking) => booking.occurrence_id === occurrenceId && booking.status === BOOKING_STATUS.HOLD)
      .flatMap((booking) => booking.booked_seats || [])
  );

  const bookedSeats = new Set(
    bookings
      .filter((booking) => booking.occurrence_id === occurrenceId && booking.status === BOOKING_STATUS.CONFIRMED)
      .flatMap((booking) => booking.booked_seats || [])
  );

  const seatStates = [];
  layout.rows.forEach((row) => {
    for (let col = 1; col <= layout.columns; col += 1) {
      const seatId = `${row}${col}`;
      const category = seatCategoryForRow(layout, row);
      let state = "AVAILABLE";
      if (bookedSeats.has(seatId)) state = "BOOKED";
      if (heldSeats.has(seatId)) state = "HELD";
      if (!bookedSeats.has(seatId) && !heldSeats.has(seatId) && (col % 9 === 0 || (row === "D" && col % 4 === 0))) {
        state = "BOOKED";
      }
      seatStates.push({ seat_id: seatId, category, state });
    }
  });

  return {
    occurrence_id: occurrenceId,
    version: 12,
    seat_layout: layout,
    seat_states: seatStates,
  };
};

const normalizeSeatMapPayload = (payload = {}) => {
  const seatStates = (payload.seat_states || []).map((state) => ({
    ...state,
    state: state.state === "LOCKED" ? "HELD" : state.state,
  }));

  const pricingMap = payload.ticket_pricing && typeof payload.ticket_pricing === "object" ? payload.ticket_pricing : {};
  const baseLayout = payload.seat_layout && typeof payload.seat_layout === "object" ? payload.seat_layout : {};
  const seatLayout = { ...baseLayout };

  if (!Array.isArray(seatLayout.rows)) seatLayout.rows = [];
  if (!Number.isFinite(Number(seatLayout.columns))) seatLayout.columns = 0;
  else seatLayout.columns = Number(seatLayout.columns);

  const existingCategories = Array.isArray(seatLayout.categories) ? seatLayout.categories : [];
  if (!existingCategories.length) {
    const fromSeatStates = [...new Set(seatStates.map((state) => state.category).filter(Boolean))];
    const keys = fromSeatStates.length ? fromSeatStates : Object.keys(pricingMap);
    seatLayout.categories = keys.map((key) => ({
      key,
      price: Number(pricingMap[key] || 0),
    }));
  }

  return {
    ...payload,
    version: Number(payload.version || 1),
    seat_layout: seatLayout,
    seat_states: seatStates,
    ticket_pricing: pricingMap,
  };
};

const deriveQuantityAndPrice = ({ occurrence, seatIds, quantity, ticketBreakdown }) => {
  if (seatIds?.length) {
    const seatMap = buildSeatMap(occurrence.id);
    const categoryMap = Object.fromEntries(
      (seatMap.seat_layout.categories || []).map((category) => [category.key, Number(category.price || 0)])
    );
    const seatPrice = seatIds.reduce((sum, seatId) => {
      const state = seatMap.seat_states.find((item) => item.seat_id === seatId);
      const categoryPrice = categoryMap[state?.category] || 0;
      return sum + categoryPrice;
    }, 0);
    return {
      quantity: seatIds.length,
      unitPrice: Math.round(seatPrice / Math.max(1, seatIds.length)),
      totalPrice: seatPrice,
    };
  }

  const safeQuantity = Math.max(1, Number(quantity || 1));
  const pricingMap = Object.fromEntries(
    Object.entries(occurrence.ticket_pricing || {}).map(([key, value]) => [String(key).toUpperCase(), Number(value || 0)])
  );
  const defaultTier = Object.keys(pricingMap)[0] || "STANDARD";

  let normalizedQuantity = safeQuantity;
  let unitPrice = Number(pricingMap[defaultTier] || 0);
  let totalPrice = unitPrice * normalizedQuantity;

  if (ticketBreakdown && typeof ticketBreakdown === "object" && Object.keys(ticketBreakdown).length) {
    const normalizedTiers = Object.entries(ticketBreakdown)
      .map(([rawTier, rawQty]) => ({
        tier: String(rawTier || "").trim().toUpperCase(),
        qty: Number(rawQty || 0),
      }))
      .filter((entry) => entry.tier && entry.qty > 0);

    if (normalizedTiers.length) {
      normalizedQuantity = normalizedTiers.reduce((sum, entry) => sum + entry.qty, 0);
      totalPrice = normalizedTiers.reduce((sum, entry) => sum + (pricingMap[entry.tier] || unitPrice) * entry.qty, 0);
      unitPrice = Math.round(totalPrice / Math.max(1, normalizedQuantity));
    }
  }

  return {
    quantity: normalizedQuantity,
    unitPrice: Number(unitPrice || 0),
    totalPrice: Number(totalPrice || 0),
  };
};

const isOfferApplicable = ({ offer, listing, totalPrice, userId }) => {
  if (!offer || !offer.is_active) return false;
  const now = Date.now();
  const from = new Date(offer.valid_from).getTime();
  const until = new Date(offer.valid_until).getTime();
  if (Number.isFinite(from) && now < from) return false;
  if (Number.isFinite(until) && now > until) return false;
  if (totalPrice < Number(offer.min_order_value || 0)) return false;

  const applicability = offer.applicability || {};
  if (applicability.city_ids?.length && !applicability.city_ids.includes(listing.city_id)) return false;
  if (applicability.types?.length && !applicability.types.includes(listing.type)) return false;
  if (applicability.categories?.length && !applicability.categories.includes(listing.category)) return false;
  if (applicability.listing_ids?.length && !applicability.listing_ids.includes(listing.id)) return false;

  const usage = getState(STORE_KEYS.OFFER_USAGE, []);
  const userOfferCount = usage.filter((item) => item.user_id === userId && item.offer_id === offer.id).length;
  if (offer.user_usage_limit && userOfferCount >= offer.user_usage_limit) return false;
  return true;
};

const calculateDiscount = (offer, totalPrice) => {
  if (!offer) return 0;
  if (offer.discount_type === "FLAT") return Math.min(Number(offer.discount_value || 0), Number(offer.max_discount_value || Infinity));
  const percentDiscount = Math.floor((totalPrice * Number(offer.discount_value || 0)) / 100);
  return Math.min(percentDiscount, Number(offer.max_discount_value || Infinity));
};

const normalizeOfferItem = (value = {}) => {
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
    max_discount_value:
      value.max_discount_value === null || value.max_discount_value === undefined ? null : Number(value.max_discount_value),
    valid_from: value.valid_from || null,
    valid_until: value.valid_until || null,
    usage_limit: value.usage_limit === null || value.usage_limit === undefined ? null : Number(value.usage_limit),
    user_usage_limit:
      value.user_usage_limit === null || value.user_usage_limit === undefined ? null : Number(value.user_usage_limit),
    is_active: value.is_active !== false,
    is_current: typeof value.is_current === "boolean" ? value.is_current : inferredCurrent,
    applicability,
  };
};

const offerMatchesScope = (offer, { cityId, listingType } = {}) => {
  const applicability = offer?.applicability || {};
  if (cityId) {
    const cityIds = Array.isArray(applicability.city_ids) ? applicability.city_ids.map((item) => String(item)) : [];
    if (cityIds.length && !cityIds.includes(String(cityId))) return false;
  }
  if (listingType) {
    const allowedTypes = Array.isArray(applicability.types)
      ? applicability.types.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
      : [];
    if (allowedTypes.length && !allowedTypes.includes(String(listingType).trim().toUpperCase())) return false;
  }
  return true;
};

const normalizeSeatIdsForLock = (raw = []) =>
  [...new Set((Array.isArray(raw) ? raw : []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))].sort();

const normalizeTicketBreakdownForLock = (raw) => {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) && raw.tickets && typeof raw.tickets === "object"
      ? raw.tickets
      : raw;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.entries(source).reduce((acc, [key, value]) => {
    const normalizedKey = String(key || "").trim().toUpperCase();
    const quantity = Number(value || 0);
    if (!normalizedKey || !Number.isFinite(quantity) || quantity <= 0) return acc;
    acc[normalizedKey] = Math.floor(quantity);
    return acc;
  }, {});
};

const lockRequestMatchesBooking = (booking, payload = {}) => {
  const requestSeats = normalizeSeatIdsForLock(payload.seat_ids || []);
  const bookingSeats = normalizeSeatIdsForLock(booking?.booked_seats || []);
  if (requestSeats.join("|") !== bookingSeats.join("|")) return false;

  const requestBreakdown = normalizeTicketBreakdownForLock(payload.ticket_breakdown);
  if (Object.keys(requestBreakdown).length) {
    const bookingBreakdown = normalizeTicketBreakdownForLock(booking?.ticket_breakdown);
    if (JSON.stringify(requestBreakdown) !== JSON.stringify(bookingBreakdown)) return false;
  }

  if (payload.quantity !== undefined && payload.quantity !== null) {
    if (Number(payload.quantity) !== Number(booking?.quantity || 0)) return false;
  }

  return true;
};

export const authService = {
  async login(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/auth/login", payload);
        return {
          access_token: response.data.access_token,
          user: normalizeUser(response.data.user),
          token_type: response.data.token_type || "bearer",
          expires_in: response.data.expires_in || 3600,
        };
      },
      async () => {
        if (!payload?.email || !payload?.password) {
          throw createError("VALIDATION_ERROR", "Email and password are required");
        }
        if (payload.password.length < 6) {
          throw createError("INVALID_CREDENTIALS", "Invalid credentials");
        }
        const isAdmin = payload.email.toLowerCase().includes("admin");
        const isTemporary = payload.password === "TempPass@123";
        const user = normalizeUser({
          ...(isAdmin ? mockAdminUser : mockUser),
          email: payload.email,
          is_temporary_password: isTemporary,
          role: isAdmin ? USER_ROLE.ADMIN : USER_ROLE.USER,
        });
        return {
          access_token: generateId("token"),
          token_type: "bearer",
          expires_in: 3600,
          user,
        };
      }
    );
  },

  async register(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/auth/register", payload);
        return {
          access_token: response.data.access_token,
          user: normalizeUser(response.data.user),
          token_type: response.data.token_type || "bearer",
          expires_in: response.data.expires_in || 3600,
        };
      },
      async () => {
        if (!payload?.name || !payload?.email || !payload?.password || !payload?.confirm_password) {
          throw createError("VALIDATION_ERROR", "Name, email, password and confirm_password are required");
        }
        if (payload.password !== payload.confirm_password) {
          throw createError("VALIDATION_ERROR", "Confirm password does not match");
        }
        return {
          access_token: generateId("token"),
          token_type: "bearer",
          expires_in: 3600,
          user: normalizeUser({
            ...mockUser,
            name: payload.name,
            email: payload.email,
            is_temporary_password: false,
          }),
        };
      }
    );
  },

  async forgotPassword(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/auth/forgot-password", payload);
        return response.data;
      },
      async () => ({
        message: "If an account with this email exists, a temporary password has been sent",
      })
    );
  },

  async changePassword(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/auth/change-password", payload);
        return response.data;
      },
      async () => {
        if (!payload?.new_password || payload.new_password.length < 8) {
          throw createError("WEAK_PASSWORD", "Password must be at least 8 characters");
        }
        if (payload.new_password !== payload.confirm_new_password) {
          throw createError("VALIDATION_ERROR", "Confirm password does not match");
        }
        return { message: "Password changed successfully" };
      }
    );
  },

  async refresh() {
    return withFallback(
      async () => {
        const response = await api.post("/auth/refresh", {});
        return response.data;
      },
      async () => ({
        access_token: generateId("token"),
        token_type: "bearer",
        expires_in: 3600,
      })
    );
  },

  async logout() {
    return withFallback(
      async () => {
        await api.post("/auth/logout", {});
        return { message: "Logged out successfully" };
      },
      async () => ({ message: "Logged out successfully" })
    );
  },
};

export const cityService = {
  async getCities() {
    return withFallback(
      async () => {
        const response = await api.get("/cities", { params: { is_active: true } });
        return normalizePaginated(response.data, normalizeCity);
      },
      async () =>
        normalizePaginated(
          {
            items: getCitiesState().filter((city) => city.is_active),
            page: 1,
            page_size: 50,
            total: getCitiesState().length,
            total_pages: 1,
          },
          normalizeCity
        )
    ,
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },

  async getVenues(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/venues", { params: sanitizeQueryParams(params, { uuidKeys: ["city_id"] }) });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const items = getVenuesState().filter((venue) => !params.city_id || venue.city_id === params.city_id);
        return normalizePaginated({ items, page: 1, page_size: 20, total: items.length, total_pages: 1 }, (item) => item);
      }
    ,
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },

  async geocodeAddress(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      throw createError("VALIDATION_ERROR", "Address is required for geocoding");
    }
    try {
      const response = await api.get("/geocode", { params: { q: trimmed } });
      return response.data;
    } catch (error) {
      throw normalizeServiceError(error);
    }
  },

  async createCity(payload) {
    return adminLiveCall(() => api.post("/admin/cities", payload));
  },

  async createVenue(payload) {
    return adminLiveCall(() => api.post("/admin/venues", payload));
  },
};

export const listingService = {
  async getFilters(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/listings/filters", {
          params: sanitizeQueryParams(params, { uuidKeys: ["city_id"] }),
        });
        return response.data;
      },
      async () => {
        const cityId = params.city_id || "city-gurugram";
        const types = params.types ? params.types.split(",") : [];
        let listings = getListingsState().filter(
          (listing) => listing.city_id === cityId && (!types.length || types.includes(listing.type))
        );
        if (!listings.length) {
          listings = getListingsState().filter((listing) => !types.length || types.includes(listing.type));
        }
        const categories = [...new Set(listings.map((listing) => listing.category).filter(Boolean))];
        return {
          categories,
          vibe_tags: ["family", "date-night", "live-music", "outdoor", "premium"],
          price_range: {
            min: Math.min(...listings.map((listing) => listing.price_min || 0), 0),
            max: Math.max(...listings.map((listing) => listing.price_max || 0), 0),
          },
        };
      }
    ,
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },

  async getListings(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/listings", {
          params: sanitizeQueryParams(params, { uuidKeys: ["city_id"] }),
        });
        return normalizePaginated(response.data, normalizeListingCard);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        const cityId = params.city_id || "city-gurugram";
        const typeList = params.types ? params.types.split(",") : [];
        const query = params.q ? params.q.toLowerCase() : "";
        const userWishlist = getState(STORE_KEYS.WISHLIST, initialMockWishlist);
        const sort = params.sort || "popularity";
        const userLat = toCoordinate(params.user_lat);
        const userLon = toCoordinate(params.user_lon);
        const hasUserCoords = userLat !== null && userLon !== null;
        const radiusKm = isPresent(params.radius_km) ? Number(params.radius_km) : null;

        if (sort === "distance" && !hasUserCoords) {
          throw createError("VALIDATION_ERROR", "User latitude and longitude are required for distance sorting");
        }
        if (isPresent(params.radius_km) && !hasUserCoords) {
          throw createError("VALIDATION_ERROR", "User latitude and longitude are required for radius filtering");
        }
        if (radiusKm !== null && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
          throw createError("VALIDATION_ERROR", "Radius must be a positive number");
        }

        const mapListings = (withCity = true) =>
          getListingsState()
            .filter((listing) => listing.status === LISTING_STATUS.PUBLISHED)
            .filter((listing) => (withCity && cityId ? listing.city_id === cityId : true))
            .filter((listing) => (!typeList.length ? true : typeList.includes(listing.type)))
            .filter((listing) => (!params.category ? true : listing.category === params.category))
            .filter((listing) => (!params.is_featured ? true : listing.is_featured))
            .filter((listing) =>
              query ? `${listing.title} ${listing.description} ${listing.category}`.toLowerCase().includes(query) : true
            )
            .map((listing) => listingWithComputedFields(listing, userWishlist));

        let items = mapListings(true);
        if (!items.length && cityId) {
          items = mapListings(false);
        }

        if (params.price_min) items = items.filter((item) => item.price_min >= Number(params.price_min));
        if (params.price_max) items = items.filter((item) => item.price_min <= Number(params.price_max));

        items = items.map((item) => {
          if (!hasUserCoords) return { ...item, distance_km: null };
          const venueLat = toCoordinate(item.venue?.latitude);
          const venueLon = toCoordinate(item.venue?.longitude);
          const distanceKm = haversineDistanceKm(userLat, userLon, venueLat, venueLon);
          return { ...item, distance_km: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(3)) : null };
        });

        if (radiusKm !== null) {
          items = items.filter((item) => item.distance_km !== null && item.distance_km <= radiusKm);
        }

        if (sort === "relevance" && query) {
          items.sort((a, b) => {
            const aText = `${a.title || ""} ${a.description || ""} ${a.category || ""}`.toLowerCase();
            const bText = `${b.title || ""} ${b.description || ""} ${b.category || ""}`.toLowerCase();
            const aIndex = aText.indexOf(query);
            const bIndex = bText.indexOf(query);
            const aScore = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
            const bScore = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
            if (aScore !== bScore) return aScore - bScore;
            return Number(b.popularity_score || 0) - Number(a.popularity_score || 0);
          });
        }
        if (sort === "popularity") items.sort((a, b) => Number(b.popularity_score || 0) - Number(a.popularity_score || 0));
        if (sort === "price_asc") items.sort((a, b) => a.price_min - b.price_min);
        if (sort === "price_desc") items.sort((a, b) => b.price_min - a.price_min);
        if (sort === "newest") items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        if (sort === "date") {
          items.sort((a, b) => {
            const aTime = a.next_occurrence ? new Date(a.next_occurrence.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.next_occurrence ? new Date(b.next_occurrence.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
          });
        }
        if (sort === "distance") {
          items.sort((a, b) => {
            const aDistance = Number.isFinite(a.distance_km) ? a.distance_km : Number.MAX_SAFE_INTEGER;
            const bDistance = Number.isFinite(b.distance_km) ? b.distance_km : Number.MAX_SAFE_INTEGER;
            if (aDistance !== bDistance) return aDistance - bDistance;
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          });
        }

        const total = items.length;
        const from = (page - 1) * pageSize;
        const paged = items.slice(from, from + pageSize);
        return normalizePaginated(
          {
            items: paged,
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
          },
          normalizeListingCard
        );
      }
    ,
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },

  async getListingById(listingId) {
    return withFallback(
      async () => {
        const response = await api.get(`/listings/${listingId}`);
        const listing = normalizeListingCard(response.data.listing || response.data);
        const occurrences = (response.data.occurrences || []).map((item) => normalizeOccurrence(item));
        return { listing, occurrences };
      },
      async () => {
        const listing = findListing(listingId);
        if (!listing) throw createError("NOT_FOUND", "Listing not found");
        const userWishlist = getState(STORE_KEYS.WISHLIST, initialMockWishlist);
        return {
          listing: listingWithComputedFields(listing, userWishlist),
          occurrences: listOccurrencesByListing(listingId).map(normalizeOccurrence),
        };
      }
    );
  },

  async getOccurrences(listingId, params = {}) {
    return withFallback(
      async () => {
        const response = await api.get(`/listings/${listingId}/occurrences`, { params });
        return normalizePaginated(response.data, normalizeOccurrence);
      },
      async () => {
        let items = listOccurrencesByListing(listingId);
        if (params.status) items = items.filter((occ) => occ.status === params.status);
        if (params.date_from) items = items.filter((occ) => new Date(occ.start_time).getTime() >= new Date(params.date_from).getTime());
        if (params.date_to) items = items.filter((occ) => new Date(occ.start_time).getTime() <= new Date(params.date_to).getTime());
        return normalizePaginated({ items, page: 1, page_size: 50, total: items.length, total_pages: 1 }, normalizeOccurrence);
      }
    );
  },

  async getSeatMap(occurrenceId) {
    return withFallback(
      async () => {
        const response = await api.get(`/occurrences/${occurrenceId}/seats`);
        return normalizeSeatMapPayload(response.data);
      },
      async () => buildSeatMap(occurrenceId)
    );
  },
};

export const offerService = {
  async getOffers(params = {}) {
    const sanitized = sanitizeQueryParams(params, { uuidKeys: ["city_id"] });
    const page = Math.max(1, Number(sanitized.page || 1));
    const requestedPageSize = Number(sanitized.page_size || 20);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(100, Math.max(1, requestedPageSize))
      : 20;
    sanitized.page = page;
    sanitized.page_size = pageSize;
    const cityId = sanitized.city_id || "";
    const listingType = String(sanitized.type || "").trim().toUpperCase();
    const query = String(sanitized.q || "").trim().toLowerCase();
    const code = String(sanitized.code || "").trim().toUpperCase();
    const currentOnly =
      typeof sanitized.current_only === "undefined"
        ? true
        : !(sanitized.current_only === false || String(sanitized.current_only).toLowerCase() === "false");

    return withFallback(
      async () => {
        const response = await api.get("/offers", { params: sanitized });
        return normalizePaginated(response.data, normalizeOfferItem);
      },
      async () => {
        let items = getOffersState().map(normalizeOfferItem);

        if (query) {
          items = items.filter((offer) =>
            `${offer.code} ${offer.title} ${offer.description || ""}`.toLowerCase().includes(query)
          );
        }
        if (code) {
          items = items.filter((offer) => offer.code.includes(code));
        }
        if (cityId || listingType) {
          items = items.filter((offer) => offerMatchesScope(offer, { cityId, listingType }));
        }
        if (currentOnly) {
          items = items.filter((offer) => offer.is_current);
        }

        items.sort((a, b) => {
          const aExpiry = new Date(a.valid_until || "").getTime();
          const bExpiry = new Date(b.valid_until || "").getTime();
          if (Number.isFinite(aExpiry) && Number.isFinite(bExpiry) && aExpiry !== bExpiry) return aExpiry - bExpiry;
          if (Number.isFinite(aExpiry)) return -1;
          if (Number.isFinite(bExpiry)) return 1;
          return a.code.localeCompare(b.code);
        });

        return normalizePaginated(paginate(items, page, pageSize), normalizeOfferItem);
      },
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },
};

export const bookingService = {
  async createLock(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/bookings/locks", payload);
        return normalizeBooking(response.data.booking);
      },
      async () => {
        const occurrence = findOccurrence(payload.occurrence_id);
        if (!occurrence) throw createError("NOT_FOUND", "Occurrence not found");
        if (occurrence.status !== OCCURRENCE_STATUS.SCHEDULED) {
          throw createError("OCCURRENCE_CANCELLED", "Occurrence is not bookable");
        }

        const listing = findListing(occurrence.listing_id);
        if (!listing || listing.status !== LISTING_STATUS.PUBLISHED) {
          throw createError("LISTING_UNAVAILABLE", "Listing is not available");
        }

        const seatIds = payload.seat_ids || [];
        if (listing.type === LISTING_TYPE.MOVIE && !seatIds.length) {
          throw createError("INVALID_SEAT_INPUT", "Movie bookings require seat selection");
        }

        if (seatIds.length) {
          const seatMap = buildSeatMap(payload.occurrence_id);
          if (
            typeof payload.seat_layout_version !== "undefined" &&
            Number(payload.seat_layout_version) !== Number(seatMap.version)
          ) {
            throw createError("SEAT_LAYOUT_VERSION_MISMATCH", "Seat map changed. Please refresh.", {
              current_version: seatMap.version,
            });
          }
          const unavailable = seatIds.find((seatId) => {
            const state = seatMap.seat_states.find((entry) => entry.seat_id === seatId);
            return !state || state.state !== "AVAILABLE";
          });
          if (unavailable) {
            throw createError("SEAT_UNAVAILABLE", "Selected seat is no longer available", { seat_id: unavailable });
          }
        }

        const current = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const currentUserId = getCurrentUserId();
        const existingHold = current.find(
          (booking) =>
            booking.user_id === currentUserId &&
            booking.occurrence_id === occurrence.id &&
            booking.status === BOOKING_STATUS.HOLD &&
            lockRequestMatchesBooking(booking, payload)
        );
        if (existingHold) {
          setState(STORE_KEYS.BOOKINGS, current);
          return normalizeBooking(existingHold);
        }

        const calculated = deriveQuantityAndPrice({
          occurrence,
          seatIds,
          quantity: payload.quantity,
          ticketBreakdown: payload.ticket_breakdown,
        });

        const booking = normalizeBooking({
          id: generateId("booking"),
          user_id: currentUserId,
          occurrence_id: occurrence.id,
          listing_snapshot: {
            listing_id: listing.id,
            title: listing.title,
            type: listing.type,
            city_name: listing.city,
          },
          booked_seats: seatIds,
          ticket_breakdown: payload.ticket_breakdown || (seatIds.length ? { SELECTED: seatIds.length } : {}),
          quantity: calculated.quantity,
          unit_price: calculated.unitPrice,
          total_price: calculated.totalPrice,
          discount_amount: 0,
          final_price: calculated.totalPrice,
          currency: listing.currency,
          status: BOOKING_STATUS.HOLD,
          hold_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          can_confirm: true,
          can_cancel: false,
          created_at: nowIso(),
          updated_at: nowIso(),
        });

        current.push(booking);
        setState(STORE_KEYS.BOOKINGS, current);
        return booking;
      }
    );
  },

  async applyOffer(bookingId, couponCode) {
    const normalizedCode = typeof couponCode === "string" ? couponCode.trim().toUpperCase() : null;
    return withFallback(
      async () => {
        const response = await api.patch(`/bookings/${bookingId}/offer`, { coupon_code: normalizedCode });
        return normalizeBooking(response.data.booking);
      },
      async () => {
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        if (booking.status !== BOOKING_STATUS.HOLD) throw createError("BOOKING_NOT_PENDING", "Booking is not in HOLD");
        if (isBookingExpired(booking)) throw createError("BOOKING_EXPIRED", "Booking hold expired");

        if (!normalizedCode) {
          const updated = {
            ...booking,
            applied_offer: null,
            applied_offer_id: null,
            discount_amount: 0,
            final_price: booking.total_price,
            updated_at: nowIso(),
          };
          const next = bookings.map((item) => (item.id === bookingId ? updated : item));
          setState(STORE_KEYS.BOOKINGS, next);
          return normalizeBooking(updated);
        }

        const listing = findListing(booking.listing_snapshot.listing_id);
        const offer = getOffersState().find((item) => item.code.toUpperCase() === normalizedCode);
        if (!offer) throw createError("OFFER_INVALID", "Coupon code is invalid");
        if (!isOfferApplicable({ offer, listing, totalPrice: booking.total_price, userId: booking.user_id })) {
          throw createError("OFFER_NOT_APPLICABLE", "Offer not applicable for this booking");
        }

        const discount = calculateDiscount(offer, booking.total_price);
        const updated = {
          ...booking,
          applied_offer: { id: offer.id, code: offer.code },
          applied_offer_id: offer.id,
          discount_amount: discount,
          final_price: Math.max(0, booking.total_price - discount),
          updated_at: nowIso(),
        };
        const next = bookings.map((item) => (item.id === bookingId ? updated : item));
        setState(STORE_KEYS.BOOKINGS, next);
        return normalizeBooking(updated);
      }
    );
  },

  async createRazorpayOrder(bookingId) {
    return withFallback(
      async () => {
        const response = await api.post(`/bookings/${bookingId}/payments/razorpay/order`, {});
        return response.data?.payment || response.data;
      },
      async () => {
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        const amountPaise = Math.round(Number(booking.final_price || booking.total_price || 0) * 100);
        if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
          throw createError("VALIDATION_ERROR", "Booking has invalid payable amount");
        }
        return {
          key_id: "rzp_test_dummy_key",
          order_id: `order_demo_${Math.random().toString(36).slice(2, 12)}`,
          amount: amountPaise,
          currency: booking.currency || "INR",
          booking_id: bookingId,
          mode: "dummy",
        };
      }
    );
  },

  async confirmBooking(bookingId, payload, idempotencyKey) {
    return withFallback(
      async () => {
        const response = await api.post(`/bookings/${bookingId}/confirm`, payload, {
          headers: { "X-Idempotency-Key": idempotencyKey },
        });
        return normalizeBooking(response.data.booking);
      },
      async () => {
        if (!idempotencyKey) throw createError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency key is required");

        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const idempotencyRows = getState(STORE_KEYS.IDEMPOTENCY, []);
        const existingKey = idempotencyRows.find((row) => row.key === idempotencyKey);
        if (existingKey) {
          const existing = bookings.find((booking) => booking.id === existingKey.booking_id);
          if (existing) return normalizeBooking(existing);
        }

        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        if (isBookingExpired(booking)) throw createError("BOOKING_EXPIRED", "Booking hold expired");
        if (booking.status !== BOOKING_STATUS.HOLD) throw createError("BOOKING_NOT_PENDING", "Booking is not in HOLD");

        const updated = normalizeBooking({
          ...booking,
          status: BOOKING_STATUS.CONFIRMED,
          payment_provider: payload?.payment_method || "MOCK",
          payment_ref: generateId("payment"),
          hold_expires_at: null,
          can_cancel: true,
          cancellation_deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          updated_at: nowIso(),
        });

        const nextBookings = bookings.map((item) => (item.id === booking.id ? updated : item));
        setState(STORE_KEYS.BOOKINGS, nextBookings);
        setState(STORE_KEYS.IDEMPOTENCY, [...idempotencyRows, { id: generateId("idem"), key: idempotencyKey, booking_id: booking.id }]);

        if (updated.applied_offer_id) {
          const usage = getState(STORE_KEYS.OFFER_USAGE, []);
          usage.push({
            id: generateId("usage"),
            user_id: updated.user_id,
            offer_id: updated.applied_offer_id,
            booking_id: updated.id,
            used_at: nowIso(),
          });
          setState(STORE_KEYS.OFFER_USAGE, usage);
        }

        const notifications = getState(STORE_KEYS.NOTIFICATIONS, initialMockNotifications);
        notifications.unshift({
          id: generateId("notif"),
          user_id: updated.user_id,
          title: "Booking Confirmed",
          body: `Your booking for ${updated.listing_snapshot.title} is confirmed.`,
          type: "BOOKING",
          reference_id: updated.id,
          is_read: false,
          created_at: nowIso(),
        });
        setState(STORE_KEYS.NOTIFICATIONS, notifications);

        return updated;
      }
    );
  },

  async getBookings(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/bookings", { params });
        return normalizePaginated(response.data, normalizeBooking);
      },
      async () => {
        const scope = params.scope || "upcoming";
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        const now = Date.now();
        const currentUser = getCurrentUserId();
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings))
          .filter((booking) => booking.user_id === currentUser)
          .map(normalizeBooking);

        const filtered = bookings.filter((booking) => {
          const occurrence = findOccurrence(booking.occurrence_id);
          const referenceTime = occurrence ? new Date(occurrence.end_time || occurrence.start_time).getTime() : 0;

          if (scope === "cancelled") return [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED].includes(booking.status);
          if (scope === "past") return booking.status === BOOKING_STATUS.CONFIRMED && referenceTime < now;
          return [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED].includes(booking.status) && referenceTime >= now;
        });

        const total = filtered.length;
        const items = filtered.slice((page - 1) * pageSize, page * pageSize);
        return normalizePaginated(
          {
            items,
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
          },
          normalizeBooking
        );
      }
    );
  },

  async getBookingById(bookingId) {
    return withFallback(
      async () => {
        const response = await api.get(`/bookings/${bookingId}`);
        return normalizeBooking(response.data.booking || response.data);
      },
      async () => {
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        setState(STORE_KEYS.BOOKINGS, bookings);
        return normalizeBooking(booking);
      }
    );
  },

  async cancelBooking(bookingId, reason) {
    return withFallback(
      async () => {
        const response = await api.patch(`/bookings/${bookingId}/cancel`, { reason });
        return response.data;
      },
      async () => {
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        if (![BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED].includes(booking.status)) {
          throw createError("ALREADY_CANCELLED", "Booking already cancelled");
        }
        const updated = {
          ...booking,
          status: BOOKING_STATUS.CANCELLED,
          cancellation_reason: reason || "User cancelled",
          can_cancel: false,
          updated_at: nowIso(),
        };
        const next = bookings.map((item) => (item.id === bookingId ? updated : item));
        setState(STORE_KEYS.BOOKINGS, next);
        return {
          message: "Booking cancelled successfully",
          booking_id: bookingId,
          refund_status: "MOCK_REFUNDED",
        };
      }
    );
  },
};

export const wishlistService = {
  async getWishlist(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/wishlists", { params });
        return normalizePaginated(response.data, normalizeListingCard);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        const wishlistIds = getState(STORE_KEYS.WISHLIST, initialMockWishlist);
        const now = Date.now();
        const items = getListingsState()
          .filter((listing) => wishlistIds.includes(listing.id))
          .filter((listing) => {
            const occurrences = listOccurrencesByListing(listing.id).filter((occ) => occ.status === OCCURRENCE_STATUS.SCHEDULED);
            return occurrences.some((occ) => new Date(occ.end_time || occ.start_time).getTime() >= now);
          })
          .map((listing) => listingWithComputedFields(listing, wishlistIds));
        const total = items.length;
        return normalizePaginated(
          {
            items: items.slice((page - 1) * pageSize, page * pageSize),
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
          },
          normalizeListingCard
        );
      }
    );
  },

  async addWishlist(listingId) {
    return withFallback(
      async () => {
        const response = await api.post("/wishlists", { listing_id: listingId });
        return response.data;
      },
      async () => {
        const wishlist = getState(STORE_KEYS.WISHLIST, initialMockWishlist);
        if (!wishlist.includes(listingId)) {
          setState(STORE_KEYS.WISHLIST, [...wishlist, listingId]);
        }
        return { message: "Added to wishlist" };
      }
    );
  },

  async removeWishlist(listingId) {
    return withFallback(
      async () => {
        const response = await api.delete(`/wishlists/${listingId}`);
        return response.data;
      },
      async () => {
        const wishlist = getState(STORE_KEYS.WISHLIST, initialMockWishlist);
        setState(
          STORE_KEYS.WISHLIST,
          wishlist.filter((item) => item !== listingId)
        );
        return { message: "Removed from wishlist" };
      }
    );
  },
};

export const notificationService = {
  async getNotifications(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/notifications", { params });
        return normalizePaginated(response.data, normalizeNotification);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        let items = getState(STORE_KEYS.NOTIFICATIONS, initialMockNotifications);
        const userId = getCurrentUserId();
        items = items.filter((item) => item.user_id === userId);
        if (params.type) items = items.filter((item) => item.type === params.type);
        if (typeof params.is_read !== "undefined") {
          const readValue = params.is_read === "true" || params.is_read === true;
          items = items.filter((item) => item.is_read === readValue);
        }
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const total = items.length;
        return normalizePaginated(
          {
            items: items.slice((page - 1) * pageSize, page * pageSize),
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
          },
          normalizeNotification
        );
      }
    );
  },

  async markOneRead(notificationId) {
    return withFallback(
      async () => {
        const response = await api.patch(`/notifications/${notificationId}/read`, {});
        return response.data;
      },
      async () => {
        const notifications = getState(STORE_KEYS.NOTIFICATIONS, initialMockNotifications);
        const next = notifications.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item));
        setState(STORE_KEYS.NOTIFICATIONS, next);
        return { message: "Notification marked as read", notification_id: notificationId };
      }
    );
  },

  async markAllRead() {
    return withFallback(
      async () => {
        const response = await api.patch("/notifications/read-all", {});
        return response.data;
      },
      async () => {
        const userId = getCurrentUserId();
        const notifications = getState(STORE_KEYS.NOTIFICATIONS, initialMockNotifications);
        let updatedCount = 0;
        const next = notifications.map((item) => {
          if (item.user_id !== userId || item.is_read) return item;
          updatedCount += 1;
          return { ...item, is_read: true };
        });
        setState(STORE_KEYS.NOTIFICATIONS, next);
        return { message: "All notifications marked as read", updated_count: updatedCount };
      }
    );
  },
};

export const mediaService = {
  async uploadImage(file, options = {}) {
    if (!(file instanceof File)) {
      throw createError("VALIDATION_ERROR", "Please choose a valid image file");
    }

    const contentBase64 = await fileToDataUrl(file);
    const folder = String(options.folder || "general").trim() || "general";
    return withFallback(
      async () => {
        const response = await api.post("/media/upload-base64", {
          filename: file.name || "upload.jpg",
          content_base64: contentBase64,
          folder,
        });
        return response.data;
      },
      async () => ({
        url: contentBase64,
        path: "",
        mime_type: file.type || "image/*",
        size: Number(file.size || 0),
      }),
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
  },
};

export const userService = {
  async getMe() {
    const cachedUser = readUserMeCache();
    if (cachedUser) return cachedUser;
    if (userMeInFlight) return userMeInFlight;

    userMeInFlight = withFallback(
      async () => {
        const response = await api.get("/users/me");
        return normalizeUser(response.data.user || response.data);
      },
      async () => {
        const current = getCurrentUser();
        return normalizeUser(current || mockUser);
      }
    )
      .then((nextUser) => {
        writeUserMeCache(nextUser);
        return nextUser;
      })
      .finally(() => {
        userMeInFlight = null;
      });

    return userMeInFlight;
  },

  async updateMe(payload) {
    return withFallback(
      async () => {
        const response = await api.patch("/users/me", payload);
        const updated = normalizeUser(response.data.user || response.data);
        writeUserMeCache(updated);
        return updated;
      },
      async () => {
        const current = normalizeUser(getCurrentUser() || mockUser);
        const updated = normalizeUser({ ...current, ...payload });
        localStorage.setItem("citiconnect_user", JSON.stringify(updated));
        writeUserMeCache(updated);
        return updated;
      }
    );
  },
};

const paginate = (items, page = 1, pageSize = 20) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
  };
};

export const adminService = {
  async getDashboard() {
    return adminLiveCall(() => api.get("/admin/dashboard"));
  },

  async getListings(params = {}) {
    return adminPaginatedCall(() => api.get("/admin/listings", { params }));
  },

  async getListingById(listingId) {
    return adminLiveCall(() => api.get(`/admin/listings/${listingId}`), (data) => data.listing || data);
  },

  async createListing(payload) {
    return adminLiveCall(() => api.post("/admin/listings", payload));
  },

  async updateListing(listingId, payload) {
    return adminLiveCall(() => api.patch(`/admin/listings/${listingId}`, payload));
  },

  async archiveListing(listingId) {
    return adminLiveCall(() => api.delete(`/admin/listings/${listingId}`));
  },

  async getOccurrences(listingId, params = {}) {
    return adminPaginatedCall(() => api.get(`/admin/listings/${listingId}/occurrences`, { params }));
  },

  async createOccurrences(listingId, payload) {
    return adminLiveCall(() => api.post(`/admin/listings/${listingId}/occurrences`, payload));
  },

  async updateOccurrence(occurrenceId, payload) {
    return adminLiveCall(() => api.patch(`/admin/occurrences/${occurrenceId}`, payload));
  },

  async cancelOccurrence(occurrenceId, reason) {
    return adminLiveCall(() => api.patch(`/admin/occurrences/${occurrenceId}/cancel`, { reason }));
  },

  async getBookings(params = {}) {
    return adminPaginatedCall(() => api.get("/admin/bookings", { params }));
  },

  async getOffers(params = {}) {
    return adminPaginatedCall(() => api.get("/admin/offers", { params }));
  },

  async createOffer(payload) {
    return adminLiveCall(() => api.post("/admin/offers", payload));
  },

  async updateOffer(offerId, payload) {
    return adminLiveCall(() => api.patch(`/admin/offers/${offerId}`, payload));
  },

  async getAuditLogs(params = {}) {
    return adminPaginatedCall(() => api.get("/admin/audit-logs", { params }));
  },
};

export const searchService = {
  async search(params = {}) {
    return listingService.getListings(params);
  },
};

export const miscService = {
  getArtists() {
    return Promise.resolve(mockArtists);
  },
};
