# CitiConnect Flow Map

This map lists identifiable flows across frontend, backend APIs, services, repositories, and key helpers.

## Auth and Session Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | Register user account | `frontend/src/components/auth/RegisterModal.jsx` | `POST /api/v1/auth/register` | `backend/app/api/endpoints/auth.py` -> `backend/app/services/auth.py::register_user` -> `backend/app/repository/auth.py::create_user` | `AuthContext.persistAuth`, `core/security.py::hash_password`, refresh cookie setter |
| AUTH-02 | Login user account | `frontend/src/components/auth/LoginModal.jsx` | `POST /api/v1/auth/login` | `auth.py` -> `services/auth.py::login_user` -> `repository/auth.py::get_user_by_email` | `core/security.py::verify_password`, `AuthContext.login` |
| AUTH-03 | Forgot password reset | `frontend/src/components/auth/ForgotPasswordModal.jsx` | `POST /api/v1/auth/forgot-password` | `auth.py` -> `services/auth.py::forgot_password` | `services/email.py::send_forgot_password_email` |
| AUTH-04 | Change password | `frontend/src/components/auth/ChangePasswordModal.jsx`, `frontend/src/pages/profile/ProfilePage.jsx` | `POST /api/v1/auth/change-password` | `auth.py` -> `services/auth.py::change_password` | `core/dependency.py::get_current_user`, password policy checks |
| AUTH-05 | Logout | `frontend/src/components/layout/ProfileDrawer.jsx`, `frontend/src/components/layout/AdminLayout.jsx` | `POST /api/v1/auth/logout` | `auth.py::logout` | `AuthContext.logout`, `api/client.js::clearStoredAuth` |
| AUTH-06 | Access token refresh and retry | `frontend/src/api/client.js` (axios interceptor) | `POST /api/v1/auth/refresh` | `auth.py::refresh` -> `services/auth.py::refresh_access_token` | refresh cookie, request replay, `_retry` guard |
| AUTH-07 | Unauthorized fallback | `frontend/src/api/client.js` + `frontend/src/context/AuthContext.jsx` | (triggered on failed refresh) | N/A | `setUnauthorizedHandler`, open login modal, clear local auth |
| AUTH-08 | Protected route authentication gate | `frontend/src/components/layout/ProtectedRoute.jsx` | N/A | N/A | `useAuth().requireAuth`, route redirect to `/` |
| AUTH-09 | Protected route role gate | `ProtectedRoute` for `/admin` in `frontend/src/App.jsx` | N/A | `backend/app/core/dependency.py::require_admin` for API calls | `USER_ROLE.ADMIN` checks in UI and API |
| AUTH-10 | Pending intent capture and replay | `ProtectedRoute.jsx`, `AuthIntentHandler.jsx` | N/A | N/A | `AuthContext.pendingIntent`, post-login navigation restore |

## Global UI and Preference Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| GLOBAL-01 | City selection persistence and broadcast | `frontend/src/components/layout/Navbar.jsx` | `GET /api/v1/cities` | `backend/app/api/endpoints/master.py::get_cities` -> `services/master.py::get_cities_page` | `frontend/src/lib/city.js`, `useSelectedCity` hook |
| GLOBAL-02 | Theme toggle persistence | `frontend/src/components/layout/ProfileDrawer.jsx` | N/A | N/A | `frontend/src/context/ThemeContext.jsx`, local storage `citiconnect_theme` |

## Discovery, Search, and Listing Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| DISC-01 | Home feed aggregation (featured + movies + events + activities) | `frontend/src/pages/public/HomePage.jsx` | `GET /api/v1/listings` | `backend/app/api/endpoints/listings.py::get_listings` -> `services/listings.py::get_listings_page` -> `repository/listings.py::fetch_public_listings` | `useSelectedCity`, `normalizeListingCard` |
| DISC-02 | Movies browse with filters and sorting | `frontend/src/pages/movies/MoviesPage.jsx` | `GET /api/v1/listings/filters`, `GET /api/v1/listings` | `listings.py::listing_filters/get_listings` | distance sort via user location |
| DISC-03 | Events browse with filters and sorting | `frontend/src/pages/events/EventsPage.jsx` | `GET /api/v1/listings/filters`, `GET /api/v1/listings` | same as above | `useUserLocation`, pagination controls |
| DISC-04 | Activities browse with filters and sorting | `frontend/src/pages/events/ActivitiesPage.jsx` | `GET /api/v1/listings/filters`, `GET /api/v1/listings` | same as above | `useUserLocation`, pagination controls |
| DISC-05 | Dining browse/search | `frontend/src/pages/events/DiningPage.jsx` | `GET /api/v1/listings` | listings endpoint/service/repository | `useListings` hook |
| DISC-06 | Search modal quick search | `frontend/src/components/common/SearchModal.jsx` | `GET /api/v1/listings` | listings endpoint/service/repository | debounce, city scoped search |
| DISC-07 | Full search page (query/type/category/sort/pagination) | `frontend/src/pages/public/SearchPage.jsx` | `GET /api/v1/listings/filters`, `GET /api/v1/listings` | listings endpoint/service/repository | URL query params state |
| DISC-08 | Listing detail load (listing + occurrences) | `frontend/src/pages/public/ListingDetailsPage.jsx` | `GET /api/v1/listings/{id}` | `listings.py::get_listing_detail` -> `services/listings.py::get_listing_detail_by_id` | media gallery parsing, metadata cards |
| DISC-09 | Listing occurrences fetch | `frontend/src/pages/booking/OccurrenceSelectionPage.jsx` (indirect via detail payload) | `GET /api/v1/listings/{id}/occurrences` (also available endpoint) | `services/listings.py::get_listing_occurrences_by_listing_id` | date-range filters available |
| DISC-10 | Venue map rendering | `frontend/src/components/domain/VenueMap.jsx` | N/A | N/A | Leaflet runtime asset loader |
| DISC-11 | Public offers listing | `frontend/src/pages/public/OffersPage.jsx` | `GET /api/v1/offers` | `backend/app/api/endpoints/master.py::get_offers` -> `services/master.py::get_offers_page` | applicability and validity display |
| DISC-12 | Geolocation-assisted distance sort | multiple listing pages via `useUserLocation` | `GET /api/v1/listings?sort=distance&user_lat&user_lon` | `services/listings.py::get_listings_page` | `frontend/src/hooks/useUserLocation.js`, backend geo helpers |

## Booking and Payment Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| BOOK-01 | Movie showtime selection | `frontend/src/pages/movies/MovieShowtimesPage.jsx` | `GET /api/v1/listings/{id}` | listing detail endpoint/service | filters scheduled upcoming occurrences |
| BOOK-02 | Seat map fetch for movie occurrence | `frontend/src/pages/booking/SeatSelectionPage.jsx` | `GET /api/v1/occurrences/{id}/seats` | `listings.py::get_occurrence_seats` -> `services/listings.py::get_occurrence_seat_map` | seat layout normalization, lock state merge |
| BOOK-03 | Seat map polling refresh | `SeatSelectionPage.jsx` | repeated `GET /occurrences/{id}/seats` | same as above | 10s interval refresh |
| BOOK-04 | Non-movie occurrence + ticket type + quantity selection | `frontend/src/pages/booking/OccurrenceSelectionPage.jsx` | `GET /api/v1/listings/{id}` | listing detail endpoint/service | per-user limit from listing metadata |
| BOOK-05 | Create hold lock (movie seats or quantity tickets) | `OccurrenceSelectionPage.jsx`, `SeatSelectionPage.jsx` | `POST /api/v1/bookings/locks` | `backend/app/api/endpoints/bookings.py::create_booking_lock` -> `services/bookings.py::create_booking_lock` | seat lock validation, capacity checks, hold expiry |
| BOOK-06 | Reuse and refresh existing matching hold | hold creation path (server-side branch) | `POST /api/v1/bookings/locks` | `services/bookings.py::create_booking_lock` existing-hold branch | `_lock_request_matches_booking` |
| BOOK-07 | Checkout bootstrap and hydration | `frontend/src/pages/booking/CheckoutPage.jsx` | `GET /api/v1/bookings/{id}`, `GET /api/v1/listings/{id}` | bookings/detail + listing/detail services | fallback from booking snapshot if listing unavailable |
| BOOK-08 | Hold countdown and expiry sync | `CheckoutPage.jsx` | `GET /api/v1/bookings/{id}` (expiry recheck) | `services/bookings.py::get_booking_by_id` | client timer + server truth |
| BOOK-09 | Load applicable offers for checkout | `CheckoutPage.jsx` -> Offer modal | `GET /api/v1/offers` | master offers endpoint/service | city/type filters + client applicability filters |
| BOOK-10 | Apply offer code | `CheckoutPage.jsx` | `PATCH /api/v1/bookings/{id}/offer` | `services/bookings.py::apply_offer_to_booking` | min order, validity, usage limits |
| BOOK-11 | Clear applied offer | `CheckoutPage.jsx` | `PATCH /api/v1/bookings/{id}/offer` with null code | same as above | resets discount and final price |
| BOOK-12 | Create Razorpay payment order | `CheckoutPage.jsx` | `POST /api/v1/bookings/{id}/payments/razorpay/order` | `services/bookings.py::create_razorpay_payment_order` -> `services/razorpay.py::create_razorpay_order` | snapshot payment order id |
| BOOK-13 | Payment script load and checkout modal | `CheckoutPage.jsx` | external `https://checkout.razorpay.com/v1/checkout.js` | N/A | idempotent script loader |
| BOOK-14 | Confirm booking with idempotency | `CheckoutPage.jsx` | `POST /api/v1/bookings/{id}/confirm` (`X-Idempotency-Key`) | `services/bookings.py::confirm_booking` | payment signature verification, idempotency table |
| BOOK-15 | Release hold from checkout | `CheckoutPage.jsx` | `PATCH /api/v1/bookings/{id}/cancel` | `services/bookings.py::cancel_booking` (HOLD branch) | releases seat locks, marks expired |
| BOOK-16 | User booking history list | `frontend/src/pages/booking/BookingsPage.jsx` | `GET /api/v1/bookings?scope=...` | `services/bookings.py::get_bookings` | scoped pagination, stale lock/hold expiry before query |
| BOOK-17 | Booking detail | `frontend/src/pages/booking/BookingDetailPage.jsx` | `GET /api/v1/bookings/{id}` | `services/bookings.py::get_booking_by_id` | cancel eligibility in payload |
| BOOK-18 | Cancel confirmed booking | `BookingDetailPage.jsx` | `PATCH /api/v1/bookings/{id}/cancel` | `services/bookings.py::cancel_booking` (CONFIRMED branch) | restores occurrence capacity |
| BOOK-19 | Booking confirmation email | confirm booking path | (triggered after BOOK-14) | `services/email.py::send_booking_confirmation_email` | fail-silently logging |

## Wishlist, Notifications, and Profile Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| USER-01 | Wishlist page list | `frontend/src/pages/profile/WishlistPage.jsx` | `GET /api/v1/wishlists` | `backend/app/api/endpoints/wishlists.py::get_wishlist` -> `services/wishlists.py::get_wishlist_page` | includes next occurrence data |
| USER-02 | Wishlist add/remove | `useWishlistToggle`, cards, wishlist page | `POST /api/v1/wishlists`, `DELETE /api/v1/wishlists/{listing_id}` | `services/wishlists.py::add_listing_to_wishlist/remove_listing_from_wishlist` | optimistic UI; recompute popularity |
| USER-03 | Notifications list with filter | `frontend/src/pages/profile/NotificationsPage.jsx` | `GET /api/v1/notifications` | `backend/app/api/endpoints/notifications.py::get_notifications` -> `services/notifications.py::get_notifications_page` | type/read filters |
| USER-04 | Mark one notification read | `NotificationsPage.jsx` | `PATCH /api/v1/notifications/{id}/read` | `services/notifications.py::mark_notification_as_read` | ownership enforcement |
| USER-05 | Mark all notifications read | `NotificationsPage.jsx` | `PATCH /api/v1/notifications/read-all` | `services/notifications.py::mark_all_as_read` | bulk update count |
| USER-06 | Profile fetch (`me`) | `frontend/src/pages/profile/ProfilePage.jsx` | `GET /api/v1/users/me` | `backend/app/api/endpoints/users.py::get_me` -> `services/users.py::get_me_profile` | normalized user payload |
| USER-07 | Profile update (`me`) | `ProfilePage.jsx` | `PATCH /api/v1/users/me` | `services/users.py::update_me_profile` | duplicate phone check |
| USER-08 | Profile image upload | `ProfilePage.jsx`, admin listing media uploads | `POST /api/v1/media/upload-base64` | `backend/app/api/endpoints/media.py::upload_base64_image` -> `services/media.py::upload_base64_media` | MIME/ext validation, Cloudinary upload |

## Admin Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| ADMIN-01 | Admin shell and route navigation | `frontend/src/components/layout/AdminLayout.jsx` | N/A | N/A | gated by `ProtectedRoute` + admin role |
| ADMIN-02 | Dashboard KPI and analytics summary | `frontend/src/pages/admin/AdminDashboard.jsx` | `GET /api/v1/admin/dashboard` | `backend/app/api/endpoints/admin.py::get_dashboard` -> `services/admin.py::get_admin_dashboard` -> `repository/admin.py` analytics queries | shared analytics filter bar |
| ADMIN-03 | Dashboard drill endpoint usage | dashboard links + analytics pages | `GET /api/v1/admin/dashboard/drill` | `admin.py::get_dashboard_drill` -> `services/admin.py::get_admin_dashboard_drill_page` | drill metric controls |
| ADMIN-04 | Analytics users page | `frontend/src/pages/admin/AdminAnalyticsUsersPage.jsx` | `GET /api/v1/admin/dashboard`, `GET /api/v1/admin/dashboard/drill?metric=new_users` | admin services/repository | sort/pagination per drill |
| ADMIN-05 | Analytics revenue page | `frontend/src/pages/admin/AdminAnalyticsRevenuePage.jsx` | `GET /api/v1/admin/dashboard/drill?metric=revenue_sources` | admin services/repository | source dimension and sorting |
| ADMIN-06 | Admin listings list/filter | `frontend/src/pages/admin/AdminListingsPage.jsx` | `GET /api/v1/admin/listings` | `admin.py::get_admin_listings` -> `services/admin.py::get_admin_listings_page` | filters type/status/city/q |
| ADMIN-07 | Admin listing detail fetch for edit | `AdminListingsPage.jsx` | `GET /api/v1/admin/listings/{listing_id}` | `services/admin.py::get_admin_listing_detail` | form prefill |
| ADMIN-08 | Create listing | `AdminListingsPage.jsx` | `POST /api/v1/admin/listings` | `services/admin.py::create_admin_listing_entry` | city/venue resolution, audit log |
| ADMIN-09 | Update listing | `AdminListingsPage.jsx` | `PATCH /api/v1/admin/listings/{listing_id}` | `services/admin.py::update_admin_listing_entry` | audit diff |
| ADMIN-10 | Archive listing and cascade cancellations | `AdminListingsPage.jsx` | `DELETE /api/v1/admin/listings/{listing_id}` | `services/admin.py::archive_admin_listing_entry` | cancels upcoming occurrences/bookings, creates notifications, sends emails |
| ADMIN-11 | Listing media uploads (cover/gallery) | `AdminListingsPage.jsx` | `POST /api/v1/media/upload-base64` | media endpoint/service | reused with profile uploads |
| ADMIN-12 | Occurrence list for listing | `frontend/src/pages/admin/AdminOccurrencesPage.jsx` | `GET /api/v1/admin/listings/{listing_id}/occurrences` | `services/admin.py::get_admin_occurrences_page` | status/q filters |
| ADMIN-13 | Create occurrences | `AdminOccurrencesPage.jsx` | `POST /api/v1/admin/listings/{listing_id}/occurrences` | `services/admin.py::create_admin_occurrence_entries` | cross-city venue rules for nationwide listings |
| ADMIN-14 | Update occurrence | `AdminOccurrencesPage.jsx` | `PATCH /api/v1/admin/occurrences/{occurrence_id}` | `services/admin.py::update_admin_occurrence_entry` | capacity guard vs used seats |
| ADMIN-15 | Cancel occurrence and cascade booking cancellations | `AdminOccurrencesPage.jsx` | `PATCH /api/v1/admin/occurrences/{occurrence_id}/cancel` | `services/admin.py::cancel_admin_occurrence_entry` | notification + email fan-out |
| ADMIN-16 | Create city | `frontend/src/pages/admin/AdminLocationsPage.jsx` | `POST /api/v1/admin/cities` | `services/admin.py::create_admin_city_entry` | admin audit log |
| ADMIN-17 | Create venue | `AdminLocationsPage.jsx` | `POST /api/v1/admin/venues` | `services/admin.py::create_admin_venue_entry` | optional geocoding fallback |
| ADMIN-18 | Geocode address from admin locations | `AdminLocationsPage.jsx` | `GET /api/v1/geocode?q=...` | `backend/app/api/endpoints/master.py::geocode_location` -> `services/master.py::geocode_location_query` | provider in `services/geocoding.py` |
| ADMIN-19 | Admin offers list | `frontend/src/pages/admin/AdminOffersPage.jsx` | `GET /api/v1/admin/offers` | `services/admin.py::get_admin_offers_page` | pagination |
| ADMIN-20 | Create offer | `AdminOffersPage.jsx` | `POST /api/v1/admin/offers` | `services/admin.py::create_admin_offer_entry` | code uniqueness/validation |
| ADMIN-21 | Toggle/update offer active state | `AdminOffersPage.jsx` | `PATCH /api/v1/admin/offers/{offer_id}` | `services/admin.py::update_admin_offer_entry` | mutation invalidates query cache |
| ADMIN-22 | Admin bookings oversight | `frontend/src/pages/admin/AdminBookingsPage.jsx` | `GET /api/v1/admin/bookings` | `services/admin.py::get_admin_bookings_page` | status/date/listing/user filters |
| ADMIN-23 | Admin audit logs list/filter | `frontend/src/pages/admin/AdminAuditLogsPage.jsx` | `GET /api/v1/admin/audit-logs` | `services/admin.py::get_admin_audit_logs_page` | action/entity filters + client text search |
| ADMIN-24 | Manual recompute popularity job (API only) | (no frontend route currently) | `POST /api/v1/admin/jobs/recompute-popularity` | `backend/app/api/endpoints/admin_jobs.py` -> `services/admin_jobs.py::recompute_popularity_job` | admin-only operation |

## System, Background, and Cross-Cutting Flows

| ID | Flow | Frontend Entry | API Endpoint(s) | Backend Path | Core Helpers / Context |
| --- | --- | --- | --- | --- | --- |
| SYS-01 | Scheduler startup/shutdown lifecycle | N/A | N/A | `backend/main.py` lifespan -> `services/scheduler.py::start_scheduler/shutdown_scheduler` | guarded by `ENABLE_SCHEDULER` |
| SYS-02 | Scheduled stale hold expiry | N/A | N/A | `scheduler.py::_run_expire_stale_booking_holds` -> `repository/booking.py::expire_stale_holds` | advisory lock guard |
| SYS-03 | Scheduled expired seat-lock release | N/A | N/A | `scheduler.py::_run_release_expired_seat_locks` -> `repository/booking.py::expire_stale_seat_locks` | advisory lock guard |
| SYS-04 | Scheduled popularity recomputation | N/A | N/A | `scheduler.py::_run_recompute_popularity_scores` -> `services/popularity.py::recompute_popularity_for_all_listings` | periodic hourly job |
| SYS-05 | Scheduled failed-booking capacity restore | N/A | N/A | `scheduler.py::_run_restore_capacity_for_failed_bookings` -> `repository/booking.py::restore_capacity_for_failed_bookings` | periodic 5-minute job |
| SYS-06 | Popularity recompute on wishlist changes | wishlist add/remove flows | (triggered inside wishlist service) | `services/wishlists.py` -> `services/popularity.py::on_wishlist_change` | booking+wishlist weighted score |
| SYS-07 | Forgot-password email delivery | AUTH-03 | (internal) | `services/email.py::send_forgot_password_email` | SMTP config in `core/config.py` |
| SYS-08 | Booking confirmation email delivery | BOOK-14 | (internal) | `services/email.py::send_booking_confirmation_email` | includes ticket/seat summary |
| SYS-09 | Occurrence/listing cancellation email delivery | ADMIN-10, ADMIN-15 | (internal) | `services/email.py::send_occurrence_cancelled_email` | async fan-out gather |
| SYS-10 | Notification fan-out on admin cancellations | ADMIN-10, ADMIN-15 | (internal DB writes) | `services/admin.py` creates `models/notification.py` rows | surfaced by notifications APIs |
| SYS-11 | API error envelope normalization | all API consumers | all endpoints | `backend/app/core/errors.py` + `frontend/src/api/services.js::normalizeServiceError` | consistent `code/message/details` handling |

