import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AuthIntentHandler from "@/components/layout/AuthIntentHandler";
import { AuthProvider } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";
import { Loader2 } from "lucide-react";
const HomePage = React.lazy(() => import("@/pages/public/HomePage"));
const MoviesPage = React.lazy(() => import("@/pages/movies/MoviesPage"));
const EventsPage = React.lazy(() => import("@/pages/events/EventsPage"));
const DiningPage = React.lazy(() => import("@/pages/events/DiningPage"));
const ActivitiesPage = React.lazy(() => import("@/pages/events/ActivitiesPage"));
const OffersPage = React.lazy(() => import("@/pages/public/OffersPage"));
const SearchPage = React.lazy(() => import("@/pages/public/SearchPage"));
const ListingDetailsPage = React.lazy(() => import("@/pages/public/ListingDetailsPage"));
const MovieShowtimesPage = React.lazy(() => import("@/pages/movies/MovieShowtimesPage"));
const SeatSelectionPage = React.lazy(() => import("@/pages/booking/SeatSelectionPage"));
const CheckoutPage = React.lazy(() => import("@/pages/booking/CheckoutPage"));
const BookingsPage = React.lazy(() => import("@/pages/booking/BookingsPage"));
const BookingDetailPage = React.lazy(() => import("@/pages/booking/BookingDetailPage"));
const WishlistPage = React.lazy(() => import("@/pages/profile/WishlistPage"));
const NotificationsPage = React.lazy(() => import("@/pages/profile/NotificationsPage"));
const ProfilePage = React.lazy(() => import("@/pages/profile/ProfilePage"));
const ForbiddenPage = React.lazy(() => import("@/pages/public/ForbiddenPage"));
const NotFoundPage = React.lazy(() => import("@/pages/public/NotFoundPage"));
const AdminDashboard = React.lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminListingsPage = React.lazy(() => import("@/pages/admin/AdminListingsPage"));
const AdminOccurrencesPage = React.lazy(() => import("@/pages/admin/AdminOccurrencesPage"));
const AdminLocationsPage = React.lazy(() => import("@/pages/admin/AdminLocationsPage"));
const AdminBookingsPage = React.lazy(() => import("@/pages/admin/AdminBookingsPage"));
const AdminOffersPage = React.lazy(() => import("@/pages/admin/AdminOffersPage"));
const AdminAuditLogsPage = React.lazy(() => import("@/pages/admin/AdminAuditLogsPage"));

const FullPageLoader = () => (
  <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Loading...</span>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <React.Suspense fallback={<FullPageLoader />}>
          <AuthIntentHandler />
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<HomePage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="movies" element={<MoviesPage />} />
              <Route path="dining" element={<DiningPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="listings/:listingId" element={<ListingDetailsPage />} />
              <Route
                path="listings/:listingId/showtimes"
                element={
                  <ProtectedRoute>
                    <MovieShowtimesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="listings/:listingId/occurrences/:occurrenceId/seats"
                element={
                  <ProtectedRoute>
                    <SeatSelectionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="checkout/:bookingId"
                element={
                  <ProtectedRoute>
                    <CheckoutPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="bookings"
                element={
                  <ProtectedRoute>
                    <BookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="bookings/:bookingId"
                element={
                  <ProtectedRoute>
                    <BookingDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="wishlist"
                element={
                  <ProtectedRoute>
                    <WishlistPage />
                  </ProtectedRoute>
                }
              />
              <Route path="whishlist" element={<Navigate to="/wishlist" replace />} />
              <Route
                path="notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route path="forbidden" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={[USER_ROLE.ADMIN]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="listings" element={<AdminListingsPage />} />
              <Route path="locations" element={<AdminLocationsPage />} />
              <Route path="listings/:listingId/occurrences" element={<AdminOccurrencesPage />} />
              <Route path="bookings" element={<AdminBookingsPage />} />
              <Route path="offers" element={<AdminOffersPage />} />
              <Route path="audit-logs" element={<AdminAuditLogsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </React.Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
