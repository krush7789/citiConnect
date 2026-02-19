import api, { createError } from "@/api/client";
import {
  initialMockAuditLogs,
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

const FORCE_MOCK = import.meta.env.VITE_FORCE_MOCK === "true";

const STORE_KEYS = {
  BOOKINGS: "citiconnect_mock_bookings",
  WISHLIST: "citiconnect_mock_wishlist",
  NOTIFICATIONS: "citiconnect_mock_notifications",
  OFFER_USAGE: "citiconnect_mock_offer_usage",
  IDEMPOTENCY: "citiconnect_mock_idempotency",
  ADMIN_LISTINGS: "citiconnect_mock_admin_listings",
  ADMIN_OCCURRENCES: "citiconnect_mock_admin_occurrences",
  ADMIN_OFFERS: "citiconnect_mock_admin_offers",
  ADMIN_AUDIT_LOGS: "citiconnect_mock_admin_audit_logs",
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

const getListingsState = () => getCollectionState(STORE_KEYS.ADMIN_LISTINGS, mockListings);
const setListingsState = (value) => setState(STORE_KEYS.ADMIN_LISTINGS, value);
const getOccurrencesState = () => getCollectionState(STORE_KEYS.ADMIN_OCCURRENCES, mockOccurrences);
const setOccurrencesState = (value) => setState(STORE_KEYS.ADMIN_OCCURRENCES, value);
const getOffersState = () => getCollectionState(STORE_KEYS.ADMIN_OFFERS, mockOffers);
const setOffersState = (value) => setState(STORE_KEYS.ADMIN_OFFERS, value);
const getAuditLogsState = () => getCollectionState(STORE_KEYS.ADMIN_AUDIT_LOGS, initialMockAuditLogs);
const setAuditLogsState = (value) => setState(STORE_KEYS.ADMIN_AUDIT_LOGS, value);

const withFallback = async (liveHandler, mockHandler, options = {}) => {
  if (FORCE_MOCK) return mockHandler();
  try {
    return await liveHandler();
  } catch (error) {
    const status = error?.response?.status;
    const fallbackStatuses = options.fallbackStatuses || [404, 500, 502, 503, 504];
    if (!error?.response || fallbackStatuses.includes(status)) return mockHandler();
    throw error;
  }
};

const nowIso = () => new Date().toISOString();
const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

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
  const venue = mockVenues.find((item) => item.id === listing.venue_id);
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
    city: mockCities.find((city) => city.id === listing.city_id)?.name || listing.city || "Gurugram",
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

  const safeQuantity = Number(quantity || 1);
  const firstPrice = Object.values(occurrence.ticket_pricing || {})[0];
  const unitPrice = Number(firstPrice || 0);
  const breakdownQuantity =
    ticketBreakdown && Object.keys(ticketBreakdown).length
      ? Object.values(ticketBreakdown).reduce((sum, value) => sum + Number(value || 0), 0)
      : safeQuantity;
  const normalizedQuantity = Math.max(1, breakdownQuantity || safeQuantity);

  return {
    quantity: normalizedQuantity,
    unitPrice,
    totalPrice: unitPrice * normalizedQuantity,
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
        if (!payload?.name || !payload?.email || !payload?.password) {
          throw createError("VALIDATION_ERROR", "Name, email and password are required");
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
          { items: mockCities.filter((city) => city.is_active), page: 1, page_size: 50, total: mockCities.length, total_pages: 1 },
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
        const items = mockVenues.filter((venue) => !params.city_id || venue.city_id === params.city_id);
        return normalizePaginated({ items, page: 1, page_size: 20, total: items.length, total_pages: 1 }, (item) => item);
      }
    ,
      { fallbackStatuses: [401, 403, 404, 500, 502, 503, 504] }
    );
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

        const sort = params.sort || "popularity";
        if (sort === "price_asc") items.sort((a, b) => a.price_min - b.price_min);
        if (sort === "price_desc") items.sort((a, b) => b.price_min - a.price_min);
        if (sort === "newest") items.sort((a, b) => b.id.localeCompare(a.id));
        if (sort === "date") {
          items.sort((a, b) => {
            const aTime = a.next_occurrence ? new Date(a.next_occurrence.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.next_occurrence ? new Date(b.next_occurrence.start_time).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
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
        const calculated = deriveQuantityAndPrice({
          occurrence,
          seatIds,
          quantity: payload.quantity,
          ticketBreakdown: payload.ticket_breakdown,
        });

        const booking = normalizeBooking({
          id: generateId("booking"),
          user_id: getCurrentUserId(),
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
    return withFallback(
      async () => {
        const response = await api.patch(`/bookings/${bookingId}/offer`, { coupon_code: couponCode });
        return normalizeBooking(response.data.booking);
      },
      async () => {
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const booking = bookings.find((item) => item.id === bookingId);
        if (!booking) throw createError("NOT_FOUND", "Booking not found");
        if (booking.status !== BOOKING_STATUS.HOLD) throw createError("BOOKING_NOT_PENDING", "Booking is not in HOLD");
        if (isBookingExpired(booking)) throw createError("BOOKING_EXPIRED", "Booking hold expired");

        if (!couponCode) {
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
        const offer = getOffersState().find((item) => item.code.toUpperCase() === String(couponCode).toUpperCase());
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
          const startTime = occurrence ? new Date(occurrence.start_time).getTime() : 0;

          if (scope === "cancelled") return [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED].includes(booking.status);
          if (scope === "past") return booking.status === BOOKING_STATUS.CONFIRMED && startTime < now;
          return [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED].includes(booking.status) && startTime >= now;
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
        const items = getListingsState()
          .filter((listing) => wishlistIds.includes(listing.id))
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

export const userService = {
  async getMe() {
    return withFallback(
      async () => {
        const response = await api.get("/users/me");
        return normalizeUser(response.data.user || response.data);
      },
      async () => {
        const current = getCurrentUser();
        return normalizeUser(current || mockUser);
      }
    );
  },

  async updateMe(payload) {
    return withFallback(
      async () => {
        const response = await api.patch("/users/me", payload);
        return normalizeUser(response.data.user || response.data);
      },
      async () => {
        const current = normalizeUser(getCurrentUser() || mockUser);
        const updated = normalizeUser({ ...current, ...payload });
        localStorage.setItem("citiconnect_user", JSON.stringify(updated));
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

const getCityName = (cityId) => mockCities.find((city) => city.id === cityId)?.name || "Unknown";
const getVenueName = (venueId) => mockVenues.find((venue) => venue.id === venueId)?.name || "Unknown venue";

const appendAuditLog = ({ action, entityType, entityId, diff }) => {
  const logs = getAuditLogsState();
  logs.unshift({
    id: generateId("log"),
    admin_user: getCurrentUser()?.name || mockAdminUser.name,
    action,
    entity_type: entityType,
    entity_id: entityId,
    diff: diff || {},
    created_at: nowIso(),
  });
  setAuditLogsState(logs);
};

export const adminService = {
  async getDashboard() {
    return withFallback(
      async () => {
        const response = await api.get("/admin/dashboard");
        return response.data;
      },
      async () => {
        const listings = getListingsState();
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        setState(STORE_KEYS.BOOKINGS, bookings);

        const now = Date.now();
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const weekStart = now - 7 * 24 * 60 * 60 * 1000;

        const bookingsToday = bookings.filter((booking) => new Date(booking.created_at).getTime() >= dayStart.getTime()).length;
        const bookingsThisWeek = bookings.filter((booking) => new Date(booking.created_at).getTime() >= weekStart).length;
        const totalRevenue = bookings
          .filter((booking) => booking.status === BOOKING_STATUS.CONFIRMED)
          .reduce((sum, booking) => sum + Number(booking.final_price || 0), 0);

        const listingBookingCount = bookings.reduce((acc, booking) => {
          const listingId = booking.listing_snapshot?.listing_id;
          if (!listingId) return acc;
          acc[listingId] = (acc[listingId] || 0) + 1;
          return acc;
        }, {});

        const recentBookings = [...bookings]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 6)
          .map((booking) => ({
            id: booking.id,
            user_name: booking.user_id === mockUser.id ? mockUser.name : "User",
            listing_title: booking.listing_snapshot?.title || "Listing",
            quantity: booking.quantity,
            final_price: booking.final_price,
            status: booking.status,
            created_at: booking.created_at,
          }));

        const topListings = listings
          .map((listing) => ({
            id: listing.id,
            title: listing.title,
            total_bookings: listingBookingCount[listing.id] || 0,
          }))
          .sort((a, b) => b.total_bookings - a.total_bookings)
          .slice(0, 6);

        return {
          stats: {
            total_listings: listings.length,
            active_listings: listings.filter((listing) => listing.status === LISTING_STATUS.PUBLISHED).length,
            total_bookings: bookings.length,
            bookings_today: bookingsToday,
            bookings_this_week: bookingsThisWeek,
            active_users: Math.max(1, new Set(bookings.map((booking) => booking.user_id)).size),
            total_revenue: totalRevenue,
          },
          recent_bookings: recentBookings,
          top_listings: topListings,
        };
      }
    );
  },

  async getListings(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/admin/listings", { params });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));

        const listingBookingCount = bookings.reduce((acc, booking) => {
          const listingId = booking.listing_snapshot?.listing_id;
          if (!listingId) return acc;
          acc[listingId] = (acc[listingId] || 0) + 1;
          return acc;
        }, {});

        let items = getListingsState().map((listing) => ({
          id: listing.id,
          type: listing.type,
          title: listing.title,
          city: getCityName(listing.city_id),
          city_id: listing.city_id,
          status: listing.status,
          total_bookings: listingBookingCount[listing.id] || 0,
          created_at: listing.created_at || nowIso(),
          offer_text: listing.offer_text || "",
          is_featured: Boolean(listing.is_featured),
        }));

        if (params.type) items = items.filter((item) => item.type === params.type);
        if (params.status) items = items.filter((item) => item.status === params.status);
        if (params.city) {
          const cityQuery = String(params.city).toLowerCase();
          items = items.filter(
            (item) => item.city.toLowerCase().includes(cityQuery) || String(item.city_id || "").toLowerCase() === cityQuery
          );
        }

        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return paginate(items, page, pageSize);
      }
    );
  },

  async getListingById(listingId) {
    return withFallback(
      async () => {
        const response = await api.get(`/admin/listings/${listingId}`);
        return response.data.listing || response.data;
      },
      async () => {
        const listing = getListingsState().find((item) => item.id === listingId);
        if (!listing) throw createError("NOT_FOUND", "Listing not found");
        return listing;
      }
    );
  },

  async createListing(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/admin/listings", payload);
        return response.data;
      },
      async () => {
        if (!payload?.type || !payload?.title || !payload?.city_id || !payload?.venue_id) {
          throw createError("VALIDATION_ERROR", "Type, title, city and venue are required");
        }

        const listings = getListingsState();
        const venue = mockVenues.find((item) => item.id === payload.venue_id);

        const next = {
          id: generateId("listing"),
          type: payload.type,
          title: payload.title,
          description: payload.description || "",
          city_id: payload.city_id,
          city: getCityName(payload.city_id),
          address: venue?.address || "",
          venue_id: payload.venue_id,
          timezone: payload.timezone || "Asia/Kolkata",
          cover_image_url: payload.cover_image_url || "",
          gallery_image_urls: payload.gallery_image_urls || [],
          price_min: Number(payload.price_min || 0),
          price_max: Number(payload.price_max || payload.price_min || 0),
          currency: payload.currency || "INR",
          category: payload.category || "",
          offer_text: payload.offer_text || "",
          smart_date_label: "New listing",
          is_wishlisted: false,
          is_featured: Boolean(payload.is_featured),
          metadata: payload.metadata || {},
          status: payload.status || LISTING_STATUS.DRAFT,
          created_at: nowIso(),
          created_by: getCurrentUser()?.id || mockAdminUser.id,
        };

        listings.unshift(next);
        setListingsState(listings);

        appendAuditLog({
          action: "CREATE_LISTING",
          entityType: "LISTING",
          entityId: next.id,
          diff: { title: next.title, status: next.status },
        });

        return {
          message: "Listing created successfully",
          listing: { id: next.id, status: next.status },
        };
      }
    );
  },

  async updateListing(listingId, payload) {
    return withFallback(
      async () => {
        const response = await api.patch(`/admin/listings/${listingId}`, payload);
        return response.data;
      },
      async () => {
        const listings = getListingsState();
        const index = listings.findIndex((listing) => listing.id === listingId);
        if (index === -1) throw createError("NOT_FOUND", "Listing not found");

        const updated = {
          ...listings[index],
          ...payload,
          price_min: payload.price_min !== undefined ? Number(payload.price_min) : listings[index].price_min,
          price_max: payload.price_max !== undefined ? Number(payload.price_max) : listings[index].price_max,
        };
        listings[index] = updated;
        setListingsState(listings);

        appendAuditLog({
          action: "UPDATE_LISTING",
          entityType: "LISTING",
          entityId: listingId,
          diff: payload,
        });

        return {
          message: "Listing updated successfully",
          listing: {
            id: updated.id,
            title: updated.title,
            offer_text: updated.offer_text || "",
            is_featured: Boolean(updated.is_featured),
            status: updated.status,
          },
        };
      }
    );
  },

  async archiveListing(listingId) {
    return withFallback(
      async () => {
        const response = await api.delete(`/admin/listings/${listingId}`);
        return response.data;
      },
      async () => {
        const listings = getListingsState();
        const listing = listings.find((item) => item.id === listingId);
        if (!listing) throw createError("NOT_FOUND", "Listing not found");

        listing.status = LISTING_STATUS.ARCHIVED;
        setListingsState(listings);

        const now = Date.now();
        const occurrences = getOccurrencesState();
        const nextOccurrences = occurrences.map((occurrence) => {
          if (
            occurrence.listing_id === listingId &&
            occurrence.status === OCCURRENCE_STATUS.SCHEDULED &&
            new Date(occurrence.start_time).getTime() >= now
          ) {
            return { ...occurrence, status: OCCURRENCE_STATUS.CANCELLED };
          }
          return occurrence;
        });
        setOccurrencesState(nextOccurrences);

        appendAuditLog({
          action: "ARCHIVE_LISTING",
          entityType: "LISTING",
          entityId: listingId,
          diff: { status: LISTING_STATUS.ARCHIVED },
        });

        return { message: "Listing archived successfully" };
      }
    );
  },

  async getOccurrences(listingId, params = {}) {
    return withFallback(
      async () => {
        const response = await api.get(`/admin/listings/${listingId}/occurrences`, { params });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);

        let items = getOccurrencesState()
          .filter((occurrence) => occurrence.listing_id === listingId)
          .map((occurrence) => ({
            ...occurrence,
            venue_name: getVenueName(occurrence.venue_id),
          }));

        if (params.status) items = items.filter((occurrence) => occurrence.status === params.status);
        items.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        return paginate(items, page, pageSize);
      }
    );
  },

  async createOccurrences(listingId, payload) {
    return withFallback(
      async () => {
        const response = await api.post(`/admin/listings/${listingId}/occurrences`, payload);
        return response.data;
      },
      async () => {
        const listing = getListingsState().find((item) => item.id === listingId);
        if (!listing) throw createError("NOT_FOUND", "Listing not found");

        const entries = payload?.occurrences || [];
        if (!entries.length) throw createError("VALIDATION_ERROR", "At least one occurrence is required");

        const occurrences = getOccurrencesState();
        const created = entries.map((entry) => ({
          id: generateId("occ"),
          listing_id: listingId,
          city_id: listing.city_id,
          venue_id: entry.venue_id,
          start_time: entry.start_time,
          end_time: entry.end_time,
          provider_sub_location: entry.provider_sub_location || "",
          capacity_total: Number(entry.capacity_total || 0),
          capacity_remaining: Number(entry.capacity_total || 0),
          ticket_pricing:
            entry.ticket_pricing ||
            (entry.price ? { STANDARD: Number(entry.price) } : {}),
          seat_layout: entry.seat_layout || null,
          status: OCCURRENCE_STATUS.SCHEDULED,
        }));

        setOccurrencesState([...created, ...occurrences]);

        appendAuditLog({
          action: "CREATE_OCCURRENCE",
          entityType: "OCCURRENCE",
          entityId: created[0].id,
          diff: { listing_id: listingId, count: created.length },
        });

        return {
          message: `${created.length} occurrence created successfully`,
          occurrences: created.map((occurrence) => ({ id: occurrence.id, status: occurrence.status })),
        };
      }
    );
  },

  async cancelOccurrence(occurrenceId, reason) {
    return withFallback(
      async () => {
        const response = await api.patch(`/admin/occurrences/${occurrenceId}/cancel`, { reason });
        return response.data;
      },
      async () => {
        const occurrences = getOccurrencesState();
        const index = occurrences.findIndex((occurrence) => occurrence.id === occurrenceId);
        if (index === -1) throw createError("NOT_FOUND", "Occurrence not found");

        occurrences[index] = {
          ...occurrences[index],
          status: OCCURRENCE_STATUS.CANCELLED,
        };
        setOccurrencesState(occurrences);

        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        const nextBookings = bookings.map((booking) => {
          if (booking.occurrence_id !== occurrenceId) return booking;
          if (![BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED].includes(booking.status)) return booking;
          return {
            ...booking,
            status: BOOKING_STATUS.CANCELLED,
            can_cancel: false,
            can_confirm: false,
            cancellation_reason: reason || "Occurrence cancelled by admin",
            updated_at: nowIso(),
          };
        });
        setState(STORE_KEYS.BOOKINGS, nextBookings);

        appendAuditLog({
          action: "CANCEL_OCCURRENCE",
          entityType: "OCCURRENCE",
          entityId: occurrenceId,
          diff: { reason: reason || "N/A" },
        });

        return {
          message: "Occurrence cancelled. Related bookings cancelled.",
          occurrence_id: occurrenceId,
        };
      }
    );
  },

  async getBookings(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/admin/bookings", { params });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);

        const bookings = applyBookingExpiry(getState(STORE_KEYS.BOOKINGS, initialMockBookings));
        setState(STORE_KEYS.BOOKINGS, bookings);

        let items = bookings.map((booking) => {
          const occurrence = findOccurrence(booking.occurrence_id);
          const listing = findListing(booking.listing_snapshot?.listing_id || "");
          return {
            id: booking.id,
            user: {
              id: booking.user_id,
              name: booking.user_id === mockUser.id ? mockUser.name : "User",
              email: booking.user_id === mockUser.id ? mockUser.email : "user@example.com",
            },
            listing_title: booking.listing_snapshot?.title || listing?.title || "Listing",
            listing_type: booking.listing_snapshot?.type || listing?.type || "EVENT",
            occurrence_start: occurrence?.start_time || booking.created_at,
            quantity: booking.quantity,
            final_price: booking.final_price,
            status: booking.status,
            created_at: booking.created_at,
          };
        });

        if (params.status) items = items.filter((booking) => booking.status === params.status);
        if (params.date_from) items = items.filter((booking) => new Date(booking.created_at).getTime() >= new Date(params.date_from).getTime());
        if (params.date_to) items = items.filter((booking) => new Date(booking.created_at).getTime() <= new Date(params.date_to).getTime());
        if (params.listing) {
          const listingQuery = String(params.listing).toLowerCase();
          items = items.filter((booking) => booking.listing_title.toLowerCase().includes(listingQuery));
        }
        if (params.user) {
          const userQuery = String(params.user).toLowerCase();
          items = items.filter(
            (booking) => booking.user.name.toLowerCase().includes(userQuery) || booking.user.email.toLowerCase().includes(userQuery)
          );
        }

        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return paginate(items, page, pageSize);
      }
    );
  },

  async getOffers(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/admin/offers", { params });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        let items = getOffersState();

        if (params.is_active === true || params.is_active === "true") {
          items = items.filter((offer) => offer.is_active);
        }
        if (params.code) {
          const query = String(params.code).toLowerCase();
          items = items.filter((offer) => offer.code.toLowerCase().includes(query));
        }

        items = [...items].sort((a, b) => new Date(b.valid_until).getTime() - new Date(a.valid_until).getTime());
        return paginate(items, page, pageSize);
      }
    );
  },

  async createOffer(payload) {
    return withFallback(
      async () => {
        const response = await api.post("/admin/offers", payload);
        return response.data;
      },
      async () => {
        if (!payload?.code || !payload?.title || !payload?.discount_type) {
          throw createError("VALIDATION_ERROR", "Code, title and discount type are required");
        }

        const offers = getOffersState();
        const normalizedCode = String(payload.code).toUpperCase().trim();
        if (offers.some((offer) => offer.code.toUpperCase() === normalizedCode)) {
          throw createError("DUPLICATE_CODE", "Offer code already exists");
        }

        const offer = {
          id: generateId("offer"),
          code: normalizedCode,
          title: payload.title,
          discount_type: payload.discount_type,
          discount_value: Number(payload.discount_value || 0),
          min_order_value: Number(payload.min_order_value || 0),
          max_discount_value: Number(payload.max_discount_value || 0),
          valid_from: payload.valid_from || nowIso(),
          valid_until: payload.valid_until || nowIso(),
          usage_limit: Number(payload.usage_limit || 0),
          user_usage_limit: Number(payload.user_usage_limit || 0),
          is_active: payload.is_active !== false,
          applicability: payload.applicability || {
            city_ids: [],
            types: [],
            categories: [],
            listing_ids: [],
          },
        };
        offers.unshift(offer);
        setOffersState(offers);

        appendAuditLog({
          action: "CREATE_OFFER",
          entityType: "OFFER",
          entityId: offer.id,
          diff: { code: offer.code, is_active: offer.is_active },
        });

        return {
          message: "Offer created successfully",
          offer: { id: offer.id, code: offer.code, is_active: offer.is_active },
        };
      }
    );
  },

  async updateOffer(offerId, payload) {
    return withFallback(
      async () => {
        const response = await api.patch(`/admin/offers/${offerId}`, payload);
        return response.data;
      },
      async () => {
        const offers = getOffersState();
        const index = offers.findIndex((offer) => offer.id === offerId);
        if (index === -1) throw createError("NOT_FOUND", "Offer not found");

        offers[index] = {
          ...offers[index],
          ...payload,
          discount_value:
            payload.discount_value !== undefined ? Number(payload.discount_value) : offers[index].discount_value,
          min_order_value:
            payload.min_order_value !== undefined ? Number(payload.min_order_value) : offers[index].min_order_value,
          max_discount_value:
            payload.max_discount_value !== undefined ? Number(payload.max_discount_value) : offers[index].max_discount_value,
        };
        setOffersState(offers);

        appendAuditLog({
          action: "UPDATE_OFFER",
          entityType: "OFFER",
          entityId: offerId,
          diff: payload,
        });

        return {
          message: "Offer updated successfully",
          offer: {
            id: offers[index].id,
            code: offers[index].code,
            is_active: offers[index].is_active,
          },
        };
      }
    );
  },

  async getAuditLogs(params = {}) {
    return withFallback(
      async () => {
        const response = await api.get("/admin/audit-logs", { params });
        return normalizePaginated(response.data, (item) => item);
      },
      async () => {
        const page = Number(params.page || 1);
        const pageSize = Number(params.page_size || 20);
        let items = getAuditLogsState();

        if (params.action) items = items.filter((log) => log.action === params.action);
        if (params.entity_type) items = items.filter((log) => log.entity_type === params.entity_type);
        items = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return paginate(items, page, pageSize);
      }
    );
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
