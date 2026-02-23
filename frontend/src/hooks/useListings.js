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
    sort,
    page = 1,
    pageSize = 12,
    userCoords,
    distanceSortEnabled,
    locationLoading,
}) {
    return useQuery({
        queryKey: [
            "listings-feed",
            types || "all",
            cityId || "all",
            query,
            sort,
            page,
            userCoords?.latitude || null,
            userCoords?.longitude || null,
        ],
        enabled: !(distanceSortEnabled && locationLoading),
        queryFn: () => {
            const effectiveSort = distanceSortEnabled && !userCoords ? "popularity" : sort;
            const queryParams = {
                city_id: cityId,
                types,
                q: query || undefined,
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
