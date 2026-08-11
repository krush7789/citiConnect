import React, { useCallback, useEffect, useMemo, useState } from "react";
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
const CITY_TABLE_PAGE_SIZE = 10;
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

const AdminLocationsPage = () => {
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [citySaving, setCitySaving] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cities, setCities] = useState([]);
  const [venueFormCityOptions, setVenueFormCityOptions] = useState([]);
  const [venueFilterCityOptions, setVenueFilterCityOptions] = useState([]);
  const [cityLookup, setCityLookup] = useState({});
  const [venueFormCitySearch, setVenueFormCitySearch] = useState("");
  const [venueFilterCitySearch, setVenueFilterCitySearch] = useState("");
  const [venues, setVenues] = useState([]);
  const [editingCityId, setEditingCityId] = useState("");
  const [editingVenueId, setEditingVenueId] = useState("");
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [cityStateFilter, setCityStateFilter] = useState("");
  const [venueSearchQuery, setVenueSearchQuery] = useState("");
  const [venueCityFilter, setVenueCityFilter] = useState("");
  const [cityTablePage, setCityTablePage] = useState(1);
  const [venueTablePage, setVenueTablePage] = useState(1);
  const [cityPageMeta, setCityPageMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [venuePageMeta, setVenuePageMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const loading = loadingCities || loadingVenues;

  const mergeCityLookup = useCallback((nextItems = []) => {
    setCityLookup((prev) => {
      const next = { ...prev };
      (nextItems || []).forEach((city) => {
        if (city?.id) {
          next[city.id] = city;
        }
      });
      return next;
    });
  }, []);

  const cityMap = useMemo(
    () => cityLookup,
    [cityLookup]
  );

  const resetCityForm = () => {
    setEditingCityId("");
    cityFormik.resetForm({ values: initialCityForm });
  };

  const resetVenueForm = () => {
    setEditingVenueId("");
    venueFormik.resetForm({
      values: {
        ...initialVenueForm,
        city_id: venueFormCityOptions[0]?.id || "",
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
        setCityTablePage(1);
        setRefreshKey((prev) => prev + 1);
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
        setVenueTablePage(1);
        setRefreshKey((prev) => prev + 1);
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
    () => cityMap[venueCityId] || null,
    [cityMap, venueCityId]
  );

  useEffect(() => {
    let mounted = true;
    setLoadingCities(true);
    cityService
      .getCitiesAdmin({
        page: cityTablePage,
        page_size: CITY_TABLE_PAGE_SIZE,
        q: citySearchQuery.trim() || undefined,
        state: cityStateFilter.trim() || undefined,
      })
      .then((response) => {
        if (!mounted) return;
        setCities(response.items || []);
        mergeCityLookup(response.items || []);
        setCityPageMeta({
          page: response.page || cityTablePage,
          total_pages: response.total_pages || 1,
          total: response.total || 0,
        });
        if (!venueFormik.values.city_id && response.items?.[0]?.id) {
          venueFormik.setFieldValue("city_id", response.items[0].id);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load cities.");
      })
      .finally(() => {
        if (mounted) setLoadingCities(false);
      });

    return () => {
      mounted = false;
    };
  }, [cityTablePage, citySearchQuery, cityStateFilter, refreshKey, mergeCityLookup]);

  useEffect(() => {
    let mounted = true;
    const query = venueFormCitySearch.trim();
    const params = query
      ? { q: query }
      : { page: 1, page_size: CITY_TABLE_PAGE_SIZE };

    cityService
      .getCitiesAdmin(params)
      .then((response) => {
        if (!mounted) return;
        const nextItems = response.items || [];
        setVenueFormCityOptions(nextItems);
        mergeCityLookup(nextItems);
      })
      .catch(() => {
        if (!mounted) return;
        setVenueFormCityOptions([]);
      });

    return () => {
      mounted = false;
    };
  }, [venueFormCitySearch, refreshKey, mergeCityLookup]);

  useEffect(() => {
    let mounted = true;
    const query = venueFilterCitySearch.trim();
    const params = query
      ? { q: query }
      : { page: 1, page_size: CITY_TABLE_PAGE_SIZE };

    cityService
      .getCitiesAdmin(params)
      .then((response) => {
        if (!mounted) return;
        const nextItems = response.items || [];
        setVenueFilterCityOptions(nextItems);
        mergeCityLookup(nextItems);
      })
      .catch(() => {
        if (!mounted) return;
        setVenueFilterCityOptions([]);
      });

    return () => {
      mounted = false;
    };
  }, [venueFilterCitySearch, refreshKey, mergeCityLookup]);

  useEffect(() => {
    let mounted = true;
    setLoadingVenues(true);
    cityService
      .getVenues({
        page: venueTablePage,
        page_size: VENUE_TABLE_PAGE_SIZE,
        q: venueSearchQuery.trim() || undefined,
        city_id: venueCityFilter || undefined,
      })
      .then((response) => {
        if (!mounted) return;
        setVenues(response.items || []);
        setVenuePageMeta({
          page: response.page || venueTablePage,
          total_pages: response.total_pages || 1,
          total: response.total || 0,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load venues.");
      })
      .finally(() => {
        if (mounted) setLoadingVenues(false);
      });

    return () => {
      mounted = false;
    };
  }, [venueTablePage, venueSearchQuery, venueCityFilter, refreshKey]);

  useEffect(() => {
    if (venueCityId || !venueFormCityOptions[0]?.id) return;
    setVenueFieldValue("city_id", venueFormCityOptions[0].id);
  }, [venueFormCityOptions, venueCityId, setVenueFieldValue]);

  useEffect(() => {
    setCityTablePage(1);
  }, [citySearchQuery, cityStateFilter]);

  useEffect(() => {
    setVenueTablePage(1);
  }, [venueSearchQuery, venueCityFilter]);

  useEffect(() => {
    setCityTablePage((prev) => Math.min(prev, cityPageMeta.total_pages || 1));
  }, [cityPageMeta.total_pages]);

  useEffect(() => {
    setVenueTablePage((prev) => Math.min(prev, venuePageMeta.total_pages || 1));
  }, [venuePageMeta.total_pages]);

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
      setRefreshKey((prev) => prev + 1);
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
    [onEditCity]
  );

  const venueColumns = useMemo(
    () => [
      { accessorKey: "name", header: "Venue" },
      {
        accessorKey: "city_id",
        header: "City",
        cell: ({ row }) => cityMap[row.original.city_id]?.name || row.original.city_id || "--",
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
    [cityMap, editingVenueId, onEditVenue, onSoftDeleteVenue]
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
                    cities={venueFormCityOptions}
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
                    pageSize={CITY_TABLE_PAGE_SIZE}
                    searchPlaceholder="Search city"
                    searchValue={venueFormCitySearch}
                    onSearchChange={setVenueFormCitySearch}
                    disableLocalFilter
                    showAllWhenSearching
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
              <Input
                value={cityStateFilter}
                onChange={(event) => setCityStateFilter(event.target.value)}
                placeholder="Filter by state"
              />
            </div>
            {!cities.length ? (
              <AdminEmptyState message="No cities found." />
            ) : (
              <>
                <AdminDataTable columns={cityColumns} data={cities} />
                <PaginationControls
                  page={cityTablePage}
                  totalPages={cityPageMeta.total_pages}
                  totalItems={cityPageMeta.total}
                  disabled={loading}
                  onPrevious={() => setCityTablePage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setCityTablePage((prev) => Math.min(cityPageMeta.total_pages, prev + 1))}
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
                cities={venueFilterCityOptions}
                value={venueCityFilter}
                onChange={(nextValue) => setVenueCityFilter(nextValue)}
                emptyOptionLabel="All cities"
                pageSize={CITY_TABLE_PAGE_SIZE}
                searchPlaceholder="Search city"
                searchValue={venueFilterCitySearch}
                onSearchChange={setVenueFilterCitySearch}
                disableLocalFilter
                showAllWhenSearching
              />
            </div>
            {!venues.length ? (
              <AdminEmptyState message="No venues found." />
            ) : (
              <>
                <AdminDataTable columns={venueColumns} data={venues} />
                <PaginationControls
                  page={venueTablePage}
                  totalPages={venuePageMeta.total_pages}
                  totalItems={venuePageMeta.total}
                  disabled={loading}
                  onPrevious={() => setVenueTablePage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setVenueTablePage((prev) => Math.min(venuePageMeta.total_pages, prev + 1))}
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
