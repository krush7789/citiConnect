import math

from sqlalchemy import func, literal
from sqlalchemy.sql.elements import ColumnElement


EARTH_RADIUS_KM = 6371.0


def haversine_sql_expression(
    lat_column: ColumnElement,
    lon_column: ColumnElement,
    user_lat: float,
    user_lon: float,
) -> ColumnElement:
    lat1 = func.radians(literal(user_lat))
    lon1 = func.radians(literal(user_lon))
    lat2 = func.radians(lat_column)
    lon2 = func.radians(lon_column)

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    a = func.pow(func.sin(d_lat / 2.0), 2) + func.cos(lat1) * func.cos(lat2) * func.pow(
        func.sin(d_lon / 2.0), 2
    )
    c = 2.0 * func.atan2(func.sqrt(a), func.sqrt(func.greatest(1.0 - a, 0.0)))
    return EARTH_RADIUS_KM * c

