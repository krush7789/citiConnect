const EARTH_RADIUS_KM = 6371;

export const toCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
export const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const toRadians = (value) => (value * Math.PI) / 180;

export const haversineDistanceKm = (fromLat, fromLon, toLat, toLon) => {
  const safeFromLat = toCoordinate(fromLat);
  const safeFromLon = toCoordinate(fromLon);
  const safeToLat = toCoordinate(toLat);
  const safeToLon = toCoordinate(toLon);

  if (
    !isValidLatitude(safeFromLat) ||
    !isValidLongitude(safeFromLon) ||
    !isValidLatitude(safeToLat) ||
    !isValidLongitude(safeToLon)
  ) {
    return null;
  }

  const deltaLat = toRadians(safeToLat - safeFromLat);
  const deltaLon = toRadians(safeToLon - safeFromLon);
  const fromLatRad = toRadians(safeFromLat);
  const toLatRad = toRadians(safeToLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};
