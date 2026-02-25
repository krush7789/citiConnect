import api, { createError } from "@/api/client";
import {
  normalizeBooking,
  normalizeCity,
  normalizeListingCard,
  normalizeNotification,
  normalizeOccurrence,
  normalizeOfferItem,
  normalizePaginated,
  normalizeUser,
} from "@/lib/contracts";

const normalizeServiceError = (error) => {
  if (error?.normalized) return error;
  const envelope = error?.response?.data?.error;
  return createError(
    envelope?.code || "REQUEST_FAILED",
    envelope?.message || error?.message || "Request failed",
    envelope?.details || {}
  );
};

const handleApiCall = async (apiFunc, transform = (data) => data) => {
  try {
    const response = await apiFunc();
    return transform(response?.data, response);
  } catch (error) {
    throw normalizeServiceError(error);
  }
};

const paginatedCall = (apiFunc, normalizeItemFn) =>
  handleApiCall(apiFunc, (data) => normalizePaginated(data, normalizeItemFn));

export const authService = {
  login: (payload) =>
    handleApiCall(() => api.post("/auth/login", payload), (data) => ({
      access_token: data.access_token,
      user: normalizeUser(data.user),
      token_type: data.token_type || "bearer",
      expires_in: data.expires_in || 3600,
    })),
  register: (payload) =>
    handleApiCall(() => api.post("/auth/register", payload), (data) => ({
      access_token: data.access_token,
      user: normalizeUser(data.user),
      token_type: data.token_type || "bearer",
      expires_in: data.expires_in || 3600,
    })),
  forgotPassword: (payload) => handleApiCall(() => api.post("/auth/forgot-password", payload)),
  changePassword: (payload) => handleApiCall(() => api.post("/auth/change-password", payload)),
  refresh: () => handleApiCall(() => api.post("/auth/refresh", {})),
  logout: () => handleApiCall(() => api.post("/auth/logout", {})),
};

export const cityService = {
  getCities: () => paginatedCall(() => api.get("/cities", { params: { is_active: true } }), normalizeCity),
  getVenues: (params = {}) => paginatedCall(() => api.get("/venues", { params }), (item) => item),
  geocodeAddress: (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) throw createError("VALIDATION_ERROR", "Address is required for geocoding");
    return handleApiCall(() => api.get("/geocode", { params: { q: trimmed } }));
  },
  createCity: (payload) => handleApiCall(() => api.post("/admin/cities", payload)),
  createVenue: (payload) => handleApiCall(() => api.post("/admin/venues", payload)),
};

export const listingService = {
  getFilters: (params = {}) => handleApiCall(() => api.get("/listings/filters", { params })),
  getListings: (params = {}) => paginatedCall(() => api.get("/listings", { params }), normalizeListingCard),
  getListingById: (listingId) =>
    handleApiCall(() => api.get(`/listings/${listingId}`), (data) => ({
      listing: normalizeListingCard(data.listing || data),
      occurrences: (data.occurrences || []).map(normalizeOccurrence),
    })),
  getOccurrences: (listingId, params = {}) =>
    paginatedCall(() => api.get(`/listings/${listingId}/occurrences`, { params }), normalizeOccurrence),
  getSeatMap: (occurrenceId) => handleApiCall(() => api.get(`/occurrences/${occurrenceId}/seats`)),
};

export const offerService = {
  getOffers: (params = {}) => paginatedCall(() => api.get("/offers", { params }), normalizeOfferItem),
};

export const bookingService = {
  createLock: (payload) =>
    handleApiCall(() => api.post("/bookings/locks", payload), (data) => {
      const booking = normalizeBooking(data?.booking || data);
      if (!booking?.id || booking.id === "booking-missing") {
        throw createError("INVALID_RESPONSE", "Unable to start booking session. Please try again.");
      }
      return booking;
    }),
  applyOffer: (bookingId, couponCode) =>
    handleApiCall(
      () =>
        api.patch(`/bookings/${bookingId}/offer`, {
          coupon_code: typeof couponCode === "string" ? couponCode.trim().toUpperCase() : null,
        }),
      (data) => normalizeBooking(data.booking)
    ),
  createRazorpayOrder: (bookingId) =>
    handleApiCall(() => api.post(`/bookings/${bookingId}/payments/razorpay/order`, {}), (data) => data?.payment || data),
  confirmBooking: (bookingId, payload, idempotencyKey) =>
    handleApiCall(
      () =>
        api.post(`/bookings/${bookingId}/confirm`, payload, {
          headers: { "X-Idempotency-Key": idempotencyKey },
        }),
      (data) => normalizeBooking(data.booking)
    ),
  getBookings: (params = {}) => paginatedCall(() => api.get("/bookings", { params }), normalizeBooking),
  getBookingById: (bookingId) =>
    handleApiCall(() => api.get(`/bookings/${bookingId}`), (data) => normalizeBooking(data.booking || data)),
  cancelBooking: (bookingId, reason) => handleApiCall(() => api.patch(`/bookings/${bookingId}/cancel`, { reason })),
};

export const wishlistService = {
  getWishlist: (params = {}) => paginatedCall(() => api.get("/wishlists", { params }), normalizeListingCard),
  addWishlist: (listingId) => handleApiCall(() => api.post("/wishlists", { listing_id: listingId })),
  removeWishlist: (listingId) => handleApiCall(() => api.delete(`/wishlists/${listingId}`)),
};

export const notificationService = {
  getNotifications: (params = {}) => paginatedCall(() => api.get("/notifications", { params }), normalizeNotification),
  markOneRead: (notificationId) => handleApiCall(() => api.patch(`/notifications/${notificationId}/read`, {})),
  markAllRead: () => handleApiCall(() => api.patch("/notifications/read-all", {})),
};

export const mediaService = {
  uploadImage: async (file, options = {}) => {
    if (!(file instanceof File)) {
      throw createError("VALIDATION_ERROR", "Please choose a valid image file");
    }
    const reader = new FileReader();
    const contentBase64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read selected file"));
      reader.readAsDataURL(file);
    });

    const folder = String(options.folder || "general").trim() || "general";
    return handleApiCall(() =>
      api.post("/media/upload-base64", {
        filename: file.name || "upload.jpg",
        content_base64: contentBase64,
        folder,
      })
    );
  },
};

export const userService = {
  getMe: () => handleApiCall(() => api.get("/users/me"), (data) => normalizeUser(data.user || data)),
  updateMe: (payload) => handleApiCall(() => api.patch("/users/me", payload), (data) => normalizeUser(data.user || data)),
};

export const adminService = {
  getDashboard: (params = {}) => handleApiCall(() => api.get("/admin/dashboard", { params })),
  getDashboardDrill: (params = {}) => handleApiCall(() => api.get("/admin/dashboard/drill", { params })),
  getListings: (params = {}) => paginatedCall(() => api.get("/admin/listings", { params }), (item) => item),
  getListingById: (listingId) => handleApiCall(() => api.get(`/admin/listings/${listingId}`), (data) => data.listing || data),
  createListing: (payload) => handleApiCall(() => api.post("/admin/listings", payload)),
  updateListing: (listingId, payload) => handleApiCall(() => api.patch(`/admin/listings/${listingId}`, payload)),
  archiveListing: (listingId) => handleApiCall(() => api.delete(`/admin/listings/${listingId}`)),
  getOccurrences: (listingId, params = {}) => paginatedCall(() => api.get(`/admin/listings/${listingId}/occurrences`, { params }), (item) => item),
  createOccurrences: (listingId, payload) => handleApiCall(() => api.post(`/admin/listings/${listingId}/occurrences`, payload)),
  updateOccurrence: (occurrenceId, payload) => handleApiCall(() => api.patch(`/admin/occurrences/${occurrenceId}`, payload)),
  cancelOccurrence: (occurrenceId, reason) => handleApiCall(() => api.patch(`/admin/occurrences/${occurrenceId}/cancel`, { reason })),
  getBookings: (params = {}) => paginatedCall(() => api.get("/admin/bookings", { params }), (item) => item),
  getOffers: (params = {}) => paginatedCall(() => api.get("/admin/offers", { params }), (item) => item),
  createOffer: (payload) => handleApiCall(() => api.post("/admin/offers", payload)),
  updateOffer: (offerId, payload) => handleApiCall(() => api.patch(`/admin/offers/${offerId}`, payload)),
  getAuditLogs: (params = {}) => paginatedCall(() => api.get("/admin/audit-logs", { params }), (item) => item),
};

export const searchService = {
  search: (params = {}) => listingService.getListings(params),
};

export const miscService = {
  getArtists: async () => [],
};
