import React, { useEffect, useMemo, useState } from "react";
import { Loader2, LocateFixed, MapPinned } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { cityService } from "@/api/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import LocationPickerMap from "@/components/domain/LocationPickerMap";
import AdminDataTable from "@/components/admin/AdminDataTable";
import PaginationControls from "@/components/common/PaginationControls";
import PaginatedCitySelect from "@/components/common/PaginatedCitySelect";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const initialCityForm = {
  name: "",
  state: "",
  is_active: true,
};

const initialVenueForm = {
  name: "",
  city_id: "",
  address: "",
  venue_type: "EVENT_SPACE",
  is_active: true,
  latitude: null,
  longitude: null,
};

const venueTypes = ["THEATER", "RESTAURANT", "EVENT_SPACE", "ACTIVITY_AREA"];
const CITY_FETCH_PAGE_SIZE = 100;
const VENUE_FETCH_PAGE_SIZE = 200;
const CITY_TABLE_PAGE_SIZE = 8;
const VENUE_TABLE_PAGE_SIZE = 12;

const cityValidationSchema = Yup.object({
  name: Yup.string().trim().required("City name is required."),
  state: Yup.string().max(120, "State is too long."),
});

const venueValidationSchema = Yup.object({
  name: Yup.string().trim().required("Venue name is required."),
  city_id: Yup.string().trim().required("City is required."),
  address: Yup.string().trim().required("Address is required."),
  venue_type: Yup.string().oneOf(venueTypes, "Invalid venue type.").required("Venue type is required."),
  is_active: Yup.boolean().required(),
  latitude: Yup.number().nullable(),
  longitude: Yup.number().nullable(),
});

const fetchAllPages = async (fetchPage) => {
  const aggregatedItems = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchPage(page);
    aggregatedItems.push(...(response.items || []));
    totalPages = Math.max(1, Number(response.total_pages) || 1);
    page += 1;
  }

  return aggregatedItems;
};

const AdminLocationsPage = () => {
  const [loading, setLoading] = useState(true);
  const [citySaving, setCitySaving] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cities, setCities] = useState([]);
  const [venues, setVenues] = useState([]);
  const [editingCityId, setEditingCityId] = useState("");
  const [editingVenueId, setEditingVenueId] = useState("");
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [cityStateFilter, setCityStateFilter] = useState("");
  const [venueSearchQuery, setVenueSearchQuery] = useState("");
  const [venueCityFilter, setVenueCityFilter] = useState("");
  const [cityTablePage, setCityTablePage] = useState(1);
  const [venueTablePage, setVenueTablePage] = useState(1);

  const cityMap = useMemo(
    () => Object.fromEntries((cities || []).map((city) => [city.id, city])),
    [cities]
  );
  const cityStates = useMemo(
    () =>
      [...new Set(
        cities
          .map((city) => String(city.state || "").trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b)),
    [cities]
  );
  const filteredCities = useMemo(() => {
    const query = String(citySearchQuery || "").trim().toLowerCase();
    return cities.filter((city) => {
      const matchesName = !query || String(city.name || "").toLowerCase().includes(query);
      const matchesState = !cityStateFilter || city.state === cityStateFilter;
      return matchesName && matchesState;
    });
  }, [cities, citySearchQuery, cityStateFilter]);
  const filteredVenues = useMemo(() => {
    const query = String(venueSearchQuery || "").trim().toLowerCase();
    return venues.filter((venue) => {
      const matchesName = !query
        || String(venue.name || "").toLowerCase().includes(query);
      const matchesCity = !venueCityFilter || venue.city_id === venueCityFilter;
      return matchesName && matchesCity;
    });
  }, [venues, venueSearchQuery, venueCityFilter]);
  const cityTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCities.length / CITY_TABLE_PAGE_SIZE)),
    [filteredCities.length]
  );
  const venueTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredVenues.length / VENUE_TABLE_PAGE_SIZE)),
    [filteredVenues.length]
  );
  const pagedCities = useMemo(() => {
    const offset = (cityTablePage - 1) * CITY_TABLE_PAGE_SIZE;
    return filteredCities.slice(offset, offset + CITY_TABLE_PAGE_SIZE);
  }, [filteredCities, cityTablePage]);
  const pagedVenues = useMemo(() => {
    const offset = (venueTablePage - 1) * VENUE_TABLE_PAGE_SIZE;
    return filteredVenues.slice(offset, offset + VENUE_TABLE_PAGE_SIZE);
  }, [filteredVenues, venueTablePage]);

  const fetchLocationsData = async () => {
    const [nextCities, nextVenues] = await Promise.all([
      fetchAllPages((page) =>
        cityService.getCitiesAdmin({ page, page_size: CITY_FETCH_PAGE_SIZE })
      ),
      fetchAllPages((page) =>
        cityService.getVenues({ page, page_size: VENUE_FETCH_PAGE_SIZE })
      ),
    ]);

    return { nextCities, nextVenues };
  };

  const loadLocations = async () => {
    const { nextCities, nextVenues } = await fetchLocationsData();
    setCities(nextCities);
    setVenues(nextVenues);
    if (!venueFormik.values.city_id && nextCities[0]?.id) {
      venueFormik.setFieldValue("city_id", nextCities[0].id);
    }
  };

  const resetCityForm = () => {
    setEditingCityId("");
    cityFormik.resetForm({ values: initialCityForm });
  };

  const resetVenueForm = () => {
    setEditingVenueId("");
    venueFormik.resetForm({
      values: {
        ...initialVenueForm,
        city_id: cities[0]?.id || "",
      },
    });
  };

  const cityFormik = useFormik({
    initialValues: initialCityForm,
    validationSchema: cityValidationSchema,
    onSubmit: async (values) => {
      setCitySaving(true);
      setError("");
      setMessage("");
      try {
        if (editingCityId) {
          await cityService.updateCity(editingCityId, {
            name: values.name.trim(),
            state: values.state.trim() || undefined,
            is_active: values.is_active,
          });
          setMessage("City updated successfully.");
        } else {
          await cityService.createCity({
            name: values.name.trim(),
            state: values.state.trim() || undefined,
          });
          setMessage("City created successfully.");
        }
        await loadLocations();
        resetCityForm();
      } catch (err) {
        setError(err?.normalized?.message || "Unable to save city.");
      } finally {
        setCitySaving(false);
      }
    },
  });
  const venueFormik = useFormik({
    initialValues: initialVenueForm,
    validationSchema: venueValidationSchema,
    onSubmit: async (values) => {
      setVenueSaving(true);
      setError("");
      setMessage("");
      try {
        const payload = {
          name: values.name.trim(),
          city_id: values.city_id,
          address: values.address.trim(),
          venue_type: values.venue_type,
          latitude: values.latitude,
          longitude: values.longitude,
          is_active: editingVenueId ? values.is_active : true,
        };
        if (editingVenueId) {
          await cityService.updateVenue(editingVenueId, payload);
          setMessage("Venue updated successfully.");
        } else {
          await cityService.createVenue(payload);
          setMessage("Venue created successfully.");
        }
        await loadLocations();
        resetVenueForm();
      } catch (err) {
        setError(err?.normalized?.message || "Unable to save venue.");
      } finally {
        setVenueSaving(false);
      }
    },
  });
  const venueCityId = venueFormik.values.city_id;
  const setVenueFieldValue = venueFormik.setFieldValue;

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === venueCityId),
    [cities, venueCityId]
  );

  useEffect(() => {
    let mounted = true;
    const fetchLocations = async () => {
      setLoading(true);
      try {
        const { nextCities, nextVenues } = await fetchLocationsData();
        if (!mounted) return;
        setCities(nextCities);
        setVenues(nextVenues);
        if (!venueFormik.values.city_id && nextCities[0]?.id) {
          venueFormik.setFieldValue("city_id", nextCities[0].id);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load locations.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchLocations();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (venueCityId || !cities[0]?.id) return;
    setVenueFieldValue("city_id", cities[0].id);
  }, [cities, venueCityId, setVenueFieldValue]);

  useEffect(() => {
    if (!venueCityFilter) return;
    if (!cities.some((city) => city.id === venueCityFilter)) {
      setVenueCityFilter("");
    }
  }, [cities, venueCityFilter]);

  useEffect(() => {
    if (!cityStateFilter) return;
    if (!cityStates.includes(cityStateFilter)) {
      setCityStateFilter("");
    }
  }, [cityStateFilter, cityStates]);

  useEffect(() => {
    setCityTablePage(1);
  }, [citySearchQuery, cityStateFilter]);

  useEffect(() => {
    setVenueTablePage(1);
  }, [venueSearchQuery, venueCityFilter]);

  useEffect(() => {
    setCityTablePage((prev) => Math.min(prev, cityTotalPages));
  }, [cityTotalPages]);

  useEffect(() => {
    setVenueTablePage((prev) => Math.min(prev, venueTotalPages));
  }, [venueTotalPages]);

  const onEditCity = (city) => {
    setEditingCityId(city.id);
    cityFormik.setValues({
      name: city.name || "",
      state: city.state || "",
      is_active: Boolean(city.is_active),
    });
  };

  const onEditVenue = (venue) => {
    setEditingVenueId(venue.id);
    venueFormik.setValues({
      name: venue.name || "",
      city_id: venue.city_id || "",
      address: venue.address || "",
      venue_type: venue.venue_type || "EVENT_SPACE",
      is_active: Boolean(venue.is_active),
      latitude: venue.latitude ?? null,
      longitude: venue.longitude ?? null,
    });
  };

  const onSoftDeleteVenue = async (venueId) => {
    const confirmed = window.confirm(
      "Soft-delete this venue? It will be marked inactive and related upcoming bookings will be cancelled."
    );
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await cityService.softDeleteVenue(venueId);
      if (editingVenueId === venueId) {
        resetVenueForm();
      }
      await loadLocations();
      setMessage("Venue soft-deleted successfully.");
    } catch (err) {
      setError(err?.normalized?.message || "Unable to soft-delete venue.");
    }
  };

  const cityColumns = useMemo(
    () => [
      { accessorKey: "name", header: "City" },
      {
        accessorKey: "state",
        header: "State",
        cell: ({ row }) => row.original.state || "--",
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (row.original.is_active ? "ACTIVE" : "INACTIVE"),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditCity(row.original)}
          >
            Edit
          </Button>
        ),
      },
    ],
    []
  );

  const venueColumns = useMemo(
    () => [
      { accessorKey: "name", header: "Venue" },
      {
        accessorKey: "city_id",
        header: "City",
        cell: ({ row }) => cityMap[row.original.city_id]?.name || "--",
      },
      {
        accessorKey: "venue_type",
        header: "Type",
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) => row.original.address || "--",
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (row.original.is_active ? "ACTIVE" : "INACTIVE"),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEditVenue(row.original)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!row.original.is_active}
              onClick={() => onSoftDeleteVenue(row.original.id)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [cityMap, editingVenueId]
  );

  const onLocateFromAddress = async () => {
    const address = venueFormik.values.address.trim();
    if (!address) {
      setError("Address is required to locate on map.");
      return;
    }

    const queryParts = [venueFormik.values.name, address, selectedCity?.name, selectedCity?.state, "India"]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const query = queryParts.join(", ");

    setGeocoding(true);
    setError("");
    setMessage("");
    try {
      const coordinates = await cityService.geocodeAddress(query);
      venueFormik.setFieldValue("latitude", coordinates.latitude);
      venueFormik.setFieldValue("longitude", coordinates.longitude);
      setMessage("Location resolved from address. You can adjust it on map.");
    } catch (err) {
      setError(err?.normalized?.message || "Unable to geocode this address.");
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Cities & Venues"
        description="Create, view, edit, and manage city/venue active status with map-based location selection."
      />

      {loading ? <AdminInlineState>Loading city data...</AdminInlineState> : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {message ? <AdminInlineState tone="success">{message}</AdminInlineState> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {editingCityId ? "Edit City" : "Create City"}
            </CardTitle>
            <CardDescription>
              {editingCityId
                ? "Update city details and set active/inactive status."
                : "Add a new city available for listings and venues."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cityFormik.handleSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">City name <span className="text-destructive">*</span></p>
                <Input
                  name="name"
                  value={cityFormik.values.name}
                  onChange={cityFormik.handleChange}
                  onBlur={cityFormik.handleBlur}
                />
                {cityFormik.touched.name && cityFormik.errors.name ? <p className="text-xs text-destructive mt-1">{cityFormik.errors.name}</p> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">State</p>
                <Input
                  name="state"
                  value={cityFormik.values.state}
                  onChange={cityFormik.handleChange}
                  onBlur={cityFormik.handleBlur}
                />
              </div>
              {editingCityId ? (
                <div className="flex items-center gap-2">
                  <input
                    id="city_active"
                    type="checkbox"
                    checked={Boolean(cityFormik.values.is_active)}
                    onChange={(event) =>
                      cityFormik.setFieldValue("is_active", event.target.checked)
                    }
                  />
                  <label htmlFor="city_active" className="text-sm">
                    City is active
                  </label>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={citySaving || !cityFormik.isValid}>
                  {citySaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {editingCityId ? "Saving city..." : "Creating city..."}
                    </>
                  ) : editingCityId ? (
                    "Save city"
                  ) : (
                    "Create city"
                  )}
                </Button>
                {editingCityId ? (
                  <Button type="button" variant="outline" onClick={resetCityForm}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {editingVenueId ? "Edit Venue" : "Create Venue"}
            </CardTitle>
            <CardDescription>
              {editingVenueId
                ? "Update venue details or mark inactive."
                : "Enter address and mark map location. Coordinates are auto-sent to backend."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={venueFormik.handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Venue name <span className="text-destructive">*</span></p>
                  <Input
                    name="name"
                    value={venueFormik.values.name}
                    onChange={venueFormik.handleChange}
                    onBlur={venueFormik.handleBlur}
                  />
                  {venueFormik.touched.name && venueFormik.errors.name ? <p className="text-xs text-destructive mt-1">{venueFormik.errors.name}</p> : null}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">City <span className="text-destructive">*</span></p>
                  <PaginatedCitySelect
                    name="city_id"
                    cities={cities}
                    value={venueFormik.values.city_id}
                    onChange={(nextValue) =>
                      venueFormik.setValues({
                        ...venueFormik.values,
                        city_id: nextValue,
                        latitude: null,
                        longitude: null,
                      })
                    }
                    onBlur={venueFormik.handleBlur}
                    required
                    includeEmptyOption={false}
                    searchPlaceholder="Search city"
                  />
                  {venueFormik.touched.city_id && venueFormik.errors.city_id ? <p className="text-xs text-destructive mt-1">{venueFormik.errors.city_id}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Venue type <span className="text-destructive">*</span></p>
                  <Select
                    name="venue_type"
                    value={venueFormik.values.venue_type}
                    onChange={venueFormik.handleChange}
                    onBlur={venueFormik.handleBlur}
                  >
                    {venueTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={onLocateFromAddress}
                      disabled={geocoding || !venueFormik.values.address.trim()}
                    >
                      {geocoding ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Locating...
                        </>
                      ) : (
                        <>
                          <LocateFixed className="h-4 w-4 mr-2" />
                          Locate From Address
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Address <span className="text-destructive">*</span></p>
                <Input
                  name="address"
                  value={venueFormik.values.address}
                  onChange={venueFormik.handleChange}
                  onBlur={venueFormik.handleBlur}
                  placeholder="Street, locality, landmark"
                />
                {venueFormik.touched.address && venueFormik.errors.address ? <p className="text-xs text-destructive mt-1">{venueFormik.errors.address}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPinned className="h-4 w-4" />
                  Map pin location
                </div>
                <LocationPickerMap
                  latitude={venueFormik.values.latitude}
                  longitude={venueFormik.values.longitude}
                  onChange={({ latitude, longitude }) => {
                    venueFormik.setFieldValue("latitude", latitude);
                    venueFormik.setFieldValue("longitude", longitude);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Selected coordinates:{" "}
                  {venueFormik.values.latitude !== null && venueFormik.values.longitude !== null
                    ? `${venueFormik.values.latitude.toFixed(6)}, ${venueFormik.values.longitude.toFixed(6)}`
                    : "Not selected (backend will try geocoding from address)."}
                </p>
              </div>

              {editingVenueId ? (
                <div className="flex items-center gap-2">
                  <input
                    id="venue_active"
                    type="checkbox"
                    checked={Boolean(venueFormik.values.is_active)}
                    onChange={(event) =>
                      venueFormik.setFieldValue("is_active", event.target.checked)
                    }
                  />
                  <label htmlFor="venue_active" className="text-sm">
                    Venue is active
                  </label>
                </div>
              ) : null}

              <Button type="submit" disabled={venueSaving || !venueFormik.isValid}>
                {venueSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingVenueId ? "Saving venue..." : "Creating venue..."}
                  </>
                ) : editingVenueId ? (
                  "Save venue"
                ) : (
                  "Create venue"
                )}
              </Button>
              {editingVenueId ? (
                <Button type="button" variant="outline" onClick={resetVenueForm}>
                  Cancel edit
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl">Cities</CardTitle>
            <CardDescription>Search cities by name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
              <Input
                value={citySearchQuery}
                onChange={(event) => setCitySearchQuery(event.target.value)}
                placeholder="Search city name"
              />
              <Select
                value={cityStateFilter}
                onChange={(event) => setCityStateFilter(event.target.value)}
              >
                <option value="">All states</option>
                {cityStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </Select>
            </div>
            {!cities.length ? (
              <AdminEmptyState message="No cities found." />
            ) : !filteredCities.length ? (
              <AdminEmptyState message="No cities match this search." />
            ) : (
              <>
                <AdminDataTable columns={cityColumns} data={pagedCities} />
                <PaginationControls
                  page={cityTablePage}
                  totalPages={cityTotalPages}
                  totalItems={filteredCities.length}
                  disabled={loading}
                  onPrevious={() => setCityTablePage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setCityTablePage((prev) => Math.min(cityTotalPages, prev + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">Venues</CardTitle>
            <CardDescription>Search venues by name and filter by city.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
              <Input
                value={venueSearchQuery}
                onChange={(event) => setVenueSearchQuery(event.target.value)}
                placeholder="Search venue name"
              />
              <PaginatedCitySelect
                cities={cities}
                value={venueCityFilter}
                onChange={(nextValue) => setVenueCityFilter(nextValue)}
                emptyOptionLabel="All cities"
                searchPlaceholder="Search city"
              />
            </div>
            {!venues.length ? (
              <AdminEmptyState message="No venues found." />
            ) : !filteredVenues.length ? (
              <AdminEmptyState message="No venues match selected filters." />
            ) : (
              <>
                <AdminDataTable columns={venueColumns} data={pagedVenues} />
                <PaginationControls
                  page={venueTablePage}
                  totalPages={venueTotalPages}
                  totalItems={filteredVenues.length}
                  disabled={loading}
                  onPrevious={() => setVenueTablePage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setVenueTablePage((prev) => Math.min(venueTotalPages, prev + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLocationsPage;
