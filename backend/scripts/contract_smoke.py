from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENDPOINTS_DIR = ROOT / "backend" / "app" / "api" / "endpoints"
FRONTEND_SERVICES_FILE = ROOT / "frontend" / "src" / "api" / "services.js"
API_PREFIX = "/api/v1"


ROUTER_PREFIX_PATTERN = re.compile(r'APIRouter\(\s*prefix\s*=\s*"([^"]+)"')
ROUTE_PATTERN = re.compile(
    r'@router\.(get|post|patch|delete)\(\s*"([^"]+)"', re.IGNORECASE
)
CLIENT_ROUTE_PATTERN = re.compile(
    r'api\.(get|post|patch|delete)\(\s*([`"])\/([^`"]*)\2', re.IGNORECASE
)


@dataclass(frozen=True)
class Route:
    method: str
    path: str


def _normalize_path(path: str) -> str:
    cleaned = path.strip()
    cleaned = re.sub(r"\$\{[^}]+\}", "{param}", cleaned)
    cleaned = re.sub(r"\{[^}]+\}", "{param}", cleaned)
    cleaned = re.sub(r"/+", "/", cleaned)
    if not cleaned.startswith("/"):
        cleaned = f"/{cleaned}"
    return cleaned


def _path_to_regex(path: str) -> re.Pattern[str]:
    escaped = re.escape(_normalize_path(path))
    escaped = escaped.replace(re.escape("{param}"), r"[^/]+")
    return re.compile(rf"^{escaped}$")


def collect_backend_routes() -> list[Route]:
    routes: list[Route] = []
    for file_path in sorted(BACKEND_ENDPOINTS_DIR.glob("*.py")):
        content = file_path.read_text(encoding="utf-8")
        prefix_match = ROUTER_PREFIX_PATTERN.search(content)
        router_prefix = prefix_match.group(1) if prefix_match else ""
        for method, route_path in ROUTE_PATTERN.findall(content):
            full_path = _normalize_path(f"{API_PREFIX}{router_prefix}{route_path}")
            routes.append(Route(method=method.upper(), path=full_path))
    return routes


def collect_frontend_routes() -> list[Route]:
    content = FRONTEND_SERVICES_FILE.read_text(encoding="utf-8")
    routes: list[Route] = []
    for method, _quote, path_body in CLIENT_ROUTE_PATTERN.findall(content):
        full_path = _normalize_path(f"{API_PREFIX}/{path_body}")
        routes.append(Route(method=method.upper(), path=full_path))
    return routes


def route_exists(frontend_route: Route, backend_routes: list[Route]) -> bool:
    for backend_route in backend_routes:
        if backend_route.method != frontend_route.method:
            continue
        backend_regex = _path_to_regex(backend_route.path)
        if backend_regex.match(_normalize_path(frontend_route.path)):
            return True
    return False


def main() -> int:
    backend_routes = collect_backend_routes()
    frontend_routes = collect_frontend_routes()

    missing: list[Route] = []
    for route in frontend_routes:
        if route_exists(route, backend_routes):
            continue
        missing.append(route)

    if not missing:
        print("Contract smoke check passed: frontend API routes map to backend endpoints.")
        return 0

    print("Contract smoke check failed. Missing backend endpoints for:")
    for route in missing:
        print(f"- {route.method} {route.path}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

