import re
from typing import Any


def normalize_seat_layout(seat_layout: Any) -> dict[str, Any]:
    if isinstance(seat_layout, dict):
        return seat_layout

    if not isinstance(seat_layout, list):
        return {}

    rows_set: set[str] = set()
    max_column = 0
    seat_category_map: dict[str, str] = {}

    for item in seat_layout:
        if not isinstance(item, dict):
            continue

        seat_id_value = item.get("id")
        seat_id = (
            str(seat_id_value).strip().upper() if seat_id_value is not None else ""
        )
        if not seat_id:
            row_name = str(item.get("row") or "").strip().upper()
            try:
                column_num = int(item.get("number"))
            except (TypeError, ValueError):
                continue
            if not row_name or column_num <= 0:
                continue
            seat_id = f"{row_name}{column_num}"

        match = re.match(r"^([A-Z]+)(\d+)$", seat_id, flags=re.IGNORECASE)
        if match:
            rows_set.add(match.group(1).upper())
            max_column = max(max_column, int(match.group(2)))

        category_value = item.get("category")
        if isinstance(category_value, str) and category_value.strip():
            seat_category_map[seat_id] = category_value.strip().upper()

    return {
        "version": 1,
        "rows": sorted(rows_set),
        "columns": max_column,
        "seat_category_map": seat_category_map,
    }


def seat_category_map_from_layout(seat_layout: Any) -> dict[str, str]:
    normalized_layout = normalize_seat_layout(seat_layout)
    mapping = normalized_layout.get("seat_category_map")
    if not isinstance(mapping, dict):
        return {}
    return {str(k).upper(): str(v).upper() for k, v in mapping.items() if v is not None}


def valid_seat_ids_from_layout(seat_layout: Any) -> set[str]:
    normalized_layout = normalize_seat_layout(seat_layout)
    if not isinstance(normalized_layout, dict):
        return set()
    seat_map = seat_category_map_from_layout(normalized_layout)
    if seat_map:
        return set(seat_map.keys())
    rows = normalized_layout.get("rows")
    columns = normalized_layout.get("columns")
    if not isinstance(rows, list) or not isinstance(columns, int) or columns <= 0:
        return set()
    valid: set[str] = set()
    for row in rows:
        for col in range(1, columns + 1):
            valid.add(f"{str(row).upper()}{col}")
    return valid


def sort_seat_id_key(seat_id: str):
    m = re.match(r"^([A-Za-z]+)(\d+)$", seat_id)
    if not m:
        return (seat_id, 0)
    return (m.group(1).upper(), int(m.group(2)))
