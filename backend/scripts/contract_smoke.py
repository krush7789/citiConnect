from __future__ import annotations

import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SERVICES_PATH = PROJECT_ROOT / "frontend" / "src" / "api" / "services.js"
BACKEND_ENDPOINTS_DIR = PROJECT_ROOT / "backend" / "app" / "api" / "endpoints"

CALL_PATTERN = re.compile(r"api\.(get|post|patch|delete)\(\s*([`\"])(.+?)\2", re.DOTALL)
ROUTE_PATTERN = re.compile(r"@router\.(get|post|patch|delete)\(\"([^\"]*)\"")
PREFIX_PATTERN = re.compile(r'APIRouter\(\s*prefix=\"([^\"]+)\"')
TEMPLATE_EXPR_PATTERN = re.compile(r"\$\{[^}]+\}")
PATH_PARAM_PATTERN = re.compile(r"\{[^}]+\}")

IGNORED_BACKEND_ROUTES: set[tuple[str, str]] = {
    ("POST", "/admin/jobs/recompute-popularity"),
}


def _normalize_path(path: str) -> str:
    normalized = TEMPLATE_EXPR_PATTERN.sub("{}", path)
    normalized = PATH_PARAM_PATTERN.sub("{}", normalized)
    return normalized


def _collect_frontend_calls(path: Path) -> set[tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    calls: set[tuple[str, str]] = set()
    for match in CALL_PATTERN.finditer(text):
        method = match.group(1).upper()
        endpoint = match.group(3).strip()
        if not endpoint.startswith("/"):
            continue
        calls.add((method, _normalize_path(endpoint)))
    return calls


def _collect_backend_routes(directory: Path) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for endpoint_file in sorted(directory.glob("*.py")):
        text = endpoint_file.read_text(encoding="utf-8")
        prefix_match = PREFIX_PATTERN.search(text)
        prefix = prefix_match.group(1) if prefix_match else ""

        for match in ROUTE_PATTERN.finditer(text):
            method = match.group(1).upper()
            route_path = match.group(2)
            full_path = _normalize_path(f"{prefix}{route_path}")
            routes.add((method, full_path))
    return routes


def main() -> int:
    frontend_calls = _collect_frontend_calls(FRONTEND_SERVICES_PATH)
    backend_routes = _collect_backend_routes(BACKEND_ENDPOINTS_DIR)

    missing_in_backend = sorted(frontend_calls - backend_routes)
    unused_in_frontend = sorted(route for route in (backend_routes - frontend_calls) if route not in IGNORED_BACKEND_ROUTES)

    print(f"frontend_calls={len(frontend_calls)}")
    print(f"backend_routes={len(backend_routes)}")
    print(f"missing_in_backend={len(missing_in_backend)}")
    for method, path in missing_in_backend:
        print(f"  MISSING {method} {path}")

    print(f"unused_in_frontend={len(unused_in_frontend)}")
    for method, path in unused_in_frontend:
        print(f"  UNUSED {method} {path}")

    if missing_in_backend:
        print("Contract smoke failed: frontend has API calls with no backend route.")
        return 1

    print("Contract smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
