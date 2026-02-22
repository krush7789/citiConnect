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
import { AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

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

const cityValidationSchema = Yup.object({
  name: Yup.string().trim().required("City name is required."),
  state: Yup.string().max(120, "State is too long."),
  is_active: Yup.boolean().required(),
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
  const [loading, setLoading] = useState(true);
  const [citySaving, setCitySaving] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cities, setCities] = useState([]);
  const cityFormik = useFormik({
    initialValues: initialCityForm,
    validationSchema: cityValidationSchema,
    onSubmit: async (values) => {
      setCitySaving(true);
      setError("");
      setMessage("");
      try {
        await cityService.createCity({
          name: values.name.trim(),
          state: values.state.trim() || undefined,
          is_active: values.is_active,
        });
        await loadCities();
        cityFormik.resetForm();
        setMessage("City created successfully.");
      } catch (err) {
        setError(err?.normalized?.message || "Unable to create city.");
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
        await cityService.createVenue({
          name: values.name.trim(),
          city_id: values.city_id,
          address: values.address.trim(),
          venue_type: values.venue_type,
          latitude: values.latitude,
          longitude: values.longitude,
          is_active: values.is_active,
        });
        venueFormik.resetForm({
          values: {
            ...initialVenueForm,
            city_id: values.city_id,
          },
        });
        setMessage("Venue created successfully.");
      } catch (err) {
        setError(err?.normalized?.message || "Unable to create venue.");
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

  const loadCities = async () => {
    const response = await cityService.getCities();
    const items = response.items || [];
    setCities(items);
    if (!venueFormik.values.city_id && items[0]?.id) {
      venueFormik.setFieldValue("city_id", items[0].id);
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchCities = async () => {
      setLoading(true);
      try {
        const response = await cityService.getCities();
        if (!mounted) return;
        setCities(response.items || []);
      } catch (err) {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load cities.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchCities();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (venueCityId || !cities[0]?.id) return;
    setVenueFieldValue("city_id", cities[0].id);
  }, [cities, venueCityId, setVenueFieldValue]);

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
        description="Create cities and configure venues with map-based location selection."
      />

      {loading ? <AdminInlineState>Loading city data...</AdminInlineState> : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {message ? <AdminInlineState tone="success">{message}</AdminInlineState> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create City</CardTitle>
            <CardDescription>Add a new city available for listings and venues.</CardDescription>
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
              <div className="flex items-center gap-2">
                <input
                  id="city_active"
                  type="checkbox"
                  checked={Boolean(cityFormik.values.is_active)}
                  onChange={(event) => cityFormik.setFieldValue("is_active", event.target.checked)}
                />
                <label htmlFor="city_active" className="text-sm">
                  City is active
                </label>
              </div>
              <Button type="submit" disabled={citySaving || !cityFormik.isValid}>
                {citySaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating city...
                  </>
                ) : (
                  "Create city"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create Venue</CardTitle>
            <CardDescription>
              Enter address and mark map location. Coordinates are auto-sent to backend.
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
                  <Select
                    name="city_id"
                    value={venueFormik.values.city_id}
                    onChange={(event) =>
                      venueFormik.setValues({
                        ...venueFormik.values,
                        city_id: event.target.value,
                        latitude: null,
                        longitude: null,
                      })
                    }
                    onBlur={venueFormik.handleBlur}
                    required
                  >
                    <option value="">Select city</option>
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </Select>
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

              <div className="flex items-center gap-2">
                <input
                  id="venue_active"
                  type="checkbox"
                  checked={Boolean(venueFormik.values.is_active)}
                  onChange={(event) => venueFormik.setFieldValue("is_active", event.target.checked)}
                />
                <label htmlFor="venue_active" className="text-sm">
                  Venue is active
                </label>
              </div>

              <Button type="submit" disabled={venueSaving || !venueFormik.isValid}>
                {venueSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating venue...
                  </>
                ) : (
                  "Create venue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLocationsPage;
