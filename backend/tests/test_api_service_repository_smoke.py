import inspect
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class ApiSmokeTests(unittest.TestCase):
    def test_api_modules_import(self):
        import app.api.endpoints.admin_jobs as admin_jobs
        import app.api.endpoints.auth as auth
        import app.api.endpoints.listings as listings
        import app.api.endpoints.master as master

        self.assertTrue(hasattr(auth, "router"))
        self.assertTrue(hasattr(master, "router"))
        self.assertTrue(hasattr(listings, "router"))
        self.assertTrue(hasattr(admin_jobs, "router"))

    def test_expected_routes_registered(self):
        from main import app

        route_pairs = {
            (method, route.path)
            for route in app.routes
            if hasattr(route, "methods")
            for method in route.methods
            if method in {"GET", "POST", "PATCH", "DELETE"}
        }

        expected = {
            ("POST", "/api/v1/auth/register"),
            ("POST", "/api/v1/auth/login"),
            ("POST", "/api/v1/auth/forgot-password"),
            ("POST", "/api/v1/auth/change-password"),
            ("POST", "/api/v1/auth/refresh"),
            ("POST", "/api/v1/auth/logout"),
            ("GET", "/api/v1/cities"),
            ("GET", "/api/v1/venues"),
            ("GET", "/api/v1/listings/filters"),
            ("GET", "/api/v1/listings"),
            ("GET", "/api/v1/listings/{id}"),
            ("GET", "/api/v1/listings/{id}/occurrences"),
            ("GET", "/api/v1/occurrences/{id}/seats"),
            ("POST", "/api/v1/admin/jobs/recompute-popularity"),
        }

        self.assertTrue(expected.issubset(route_pairs))


class ServiceSmokeTests(unittest.TestCase):
    def test_service_modules_import_and_helpers(self):
        import app.services.auth as auth_service
        import app.services.geo as geo_service
        import app.services.geocoding as geocoding_service
        import app.services.popularity as popularity_service

        self.assertTrue(callable(geo_service.haversine_km))
        self.assertTrue(callable(geo_service.haversine_sql_expression))
        self.assertTrue(inspect.iscoroutinefunction(geocoding_service.geocode_address))
        self.assertTrue(inspect.iscoroutinefunction(popularity_service.recompute_popularity_for_all_listings))
        self.assertTrue(inspect.iscoroutinefunction(auth_service.register_user))

        self.assertAlmostEqual(geo_service.haversine_km(19.0760, 72.8777, 19.0760, 72.8777), 0.0, places=6)

    def test_config_uses_basesettings_shape(self):
        from app.core.config import BaseSettings, Settings, settings

        self.assertTrue(issubclass(Settings, BaseSettings))
        self.assertTrue(hasattr(settings, "database_url"))
        self.assertTrue(hasattr(settings, "normalized_database_url"))


class RepositorySmokeTests(unittest.TestCase):
    def test_repository_modules_import(self):
        import app.repository.auth as auth_repo
        import app.repository.city as city_repo
        import app.repository.listing as listing_repo
        import app.repository.venue as venue_repo

        expected_async = {
            auth_repo: ["create_user", "get_user_by_email", "get_user_by_id"],
            city_repo: ["list_cities"],
            venue_repo: ["list_venues"],
            listing_repo: [
                "list_listings",
                "get_listing_by_id",
                "list_occurrences_for_listing",
                "get_occurrence_by_id",
                "get_confirmed_booked_seats",
                "get_active_seat_locks",
                "get_filters_metadata",
                "get_next_occurrences_for_listing_ids",
            ],
        }

        for module, functions in expected_async.items():
            for fn_name in functions:
                fn = getattr(module, fn_name)
                self.assertTrue(inspect.iscoroutinefunction(fn), f"{module.__name__}.{fn_name} should be async")


if __name__ == "__main__":
    unittest.main()
