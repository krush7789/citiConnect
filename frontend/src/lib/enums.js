export const LISTING_TYPE = Object.freeze({
  EVENT: "EVENT",
  MOVIE: "MOVIE",
  RESTAURANT: "RESTAURANT",
  ACTIVITY: "ACTIVITY",
});

export const LISTING_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
});

export const OCCURRENCE_STATUS = Object.freeze({
  SCHEDULED: "SCHEDULED",
  CANCELLED: "CANCELLED",
  SOLD_OUT: "SOLD_OUT",
  ARCHIVED: "ARCHIVED",
});

export const BOOKING_STATUS = Object.freeze({
  HOLD: "HOLD",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
});

export const USER_ROLE = Object.freeze({
  USER: "USER",
  ADMIN: "ADMIN",
});
