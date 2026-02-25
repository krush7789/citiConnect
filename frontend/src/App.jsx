import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AuthIntentHandler from "@/components/layout/AuthIntentHandler";
import { AuthProvider } from "@/context/AuthContext";
import { USER_ROLE } from "@/lib/enums";
import { Loader2 } from "lucide-react";
const HomePage = lazy(() => import("@/pages/public/HomePage"));
const MoviesPage = lazy(() => import("@/pages/movies/MoviesPage"));
const EventsPage = lazy(() => import("@/pages/events/EventsPage"));
const DiningPage = lazy(() => import("@/pages/events/DiningPage"));
const ActivitiesPage = lazy(() => import("@/pages/events/ActivitiesPage"));
const OffersPage = lazy(() => import("@/pages/public/OffersPage"));
const SearchPage = lazy(() => import("@/pages/public/SearchPage"));
const ListingDetailsPage = lazy(() => import("@/pages/public/ListingDetailsPage"));
const MovieShowtimesPage = lazy(() => import("@/pages/movies/MovieShowtimesPage"));
const OccurrenceSelectionPage = lazy(() => import("@/pages/booking/OccurrenceSelectionPage"));
const SeatSelectionPage = lazy(() => import("@/pages/booking/SeatSelectionPage"));
const CheckoutPage = lazy(() => import("@/pages/booking/CheckoutPage"));
const BookingsPage = lazy(() => import("@/pages/booking/BookingsPage"));
const BookingDetailPage = lazy(() => import("@/pages/booking/BookingDetailPage"));
const WishlistPage = lazy(() => import("@/pages/profile/WishlistPage"));
const NotificationsPage = lazy(() => import("@/pages/profile/NotificationsPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const ForbiddenPage = lazy(() => import("@/pages/public/ForbiddenPage"));
const NotFoundPage = lazy(() => import("@/pages/public/NotFoundPage"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminListingsPage = lazy(() => import("@/pages/admin/AdminListingsPage"));
const AdminOccurrencesPage = lazy(() => import("@/pages/admin/AdminOccurrencesPage"));
const AdminLocationsPage = lazy(() => import("@/pages/admin/AdminLocationsPage"));
const AdminBookingsPage = lazy(() => import("@/pages/admin/AdminBookingsPage"));
const AdminOffersPage = lazy(() => import("@/pages/admin/AdminOffersPage"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/AdminAuditLogsPage"));

const protectedMainRoutes = [
  { path: "listings/:listingId/showtimes", element: <MovieShowtimesPage /> },
  { path: "listings/:listingId/occurrences", element: <OccurrenceSelectionPage /> },
  { path: "listings/:listingId/occurrences/:occurrenceId/seats", element: <SeatSelectionPage /> },
  { path: "checkout/:bookingId", element: <CheckoutPage /> },
  { path: "bookings", element: <BookingsPage /> },
  { path: "bookings/:bookingId", element: <BookingDetailPage /> },
  { path: "wishlist", element: <WishlistPage /> },
  { path: "notifications", element: <NotificationsPage /> },
  { path: "profile", element: <ProfilePage /> },
];

const adminRoutes = [
  { path: "dashboard", element: <AdminDashboard /> },
  { path: "listings", element: <AdminListingsPage /> },
  { path: "locations", element: <AdminLocationsPage /> },
  { path: "listings/:listingId/occurrences", element: <AdminOccurrencesPage /> },
  { path: "bookings", element: <AdminBookingsPage /> },
  { path: "offers", element: <AdminOffersPage /> },
  { path: "audit-logs", element: <AdminAuditLogsPage /> },
];

const FullPageLoader = () => (
  <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Loading...</span>
  </div>
);

const withAuth = (element, roles) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<FullPageLoader />}>
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
              {protectedMainRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={withAuth(route.element)} />
              ))}
              <Route path="forbidden" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route
              path="/admin"
              element={withAuth(<AdminLayout />, [USER_ROLE.ADMIN])}
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              {adminRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
