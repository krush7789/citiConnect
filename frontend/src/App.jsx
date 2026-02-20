import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import AdminLayout from "@/components/AdminLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";
import HomePage from "@/pages/HomePage";
import MoviesPage from "@/pages/MoviesPage";
import EventsPage from "@/pages/EventsPage";
import DiningPage from "@/pages/DiningPage";
import ActivitiesPage from "@/pages/ActivitiesPage";
import OffersPage from "@/pages/OffersPage";
import SearchPage from "@/pages/SearchPage";
import ListingDetailsPage from "@/pages/ListingDetailsPage";
import MovieShowtimesPage from "@/pages/MovieShowtimesPage";
import SeatSelectionPage from "@/pages/SeatSelectionPage";
import CheckoutPage from "@/pages/CheckoutPage";
import BookingsPage from "@/pages/BookingsPage";
import BookingDetailPage from "@/pages/BookingDetailPage";
import WishlistPage from "@/pages/WishlistPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ProfilePage from "@/pages/ProfilePage";
import ForbiddenPage from "@/pages/ForbiddenPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminListingsPage from "@/pages/AdminListingsPage";
import AdminOccurrencesPage from "@/pages/AdminOccurrencesPage";
import AdminLocationsPage from "@/pages/AdminLocationsPage";
import AdminBookingsPage from "@/pages/AdminBookingsPage";
import AdminOffersPage from "@/pages/AdminOffersPage";
import AdminAuditLogsPage from "@/pages/AdminAuditLogsPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
