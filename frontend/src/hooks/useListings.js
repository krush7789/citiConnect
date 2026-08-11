import { useQuery } from "@tanstack/react-query";
import { listingService } from "@/api/services";

/**
 * Custom hook to fetch listings with standard query parameters.
 * Encapsulates the React Query logic for reusability across pages.
 */
export default function useListings({
  cityId,
  types,
  query,
  category,
  sort,
  fallbackSort = "popularity",
  page = 1,
  pageSize = 12,
  userCoords,
  distanceSortEnabled = false,
  locationLoading = false,
  queryKeyPrefix = "listings-feed",
  extraQueryKey = [],
}) {
  return useQuery({
    queryKey: [
      queryKeyPrefix,
      types,
      cityId,
      query,
      category,
      sort,
      fallbackSort,
      page,
      pageSize,
      userCoords?.latitude || null,
      userCoords?.longitude || null,
      ...extraQueryKey,
    ],
    enabled: !(distanceSortEnabled && locationLoading),
    queryFn: () => {
      const effectiveSort = distanceSortEnabled && !userCoords ? fallbackSort : sort;
      const queryParams = {
        city_id: cityId,
        types: types || undefined,
        q: query || undefined,
        category: category && category !== "All" ? category : undefined,
        sort: effectiveSort,
        page,
        page_size: pageSize,
      };

      if (distanceSortEnabled && userCoords) {
        queryParams.user_lat = userCoords.latitude;
        queryParams.user_lon = userCoords.longitude;
      }

      return listingService.getListings(queryParams);
    },
  });
}
