import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useNavigate, useParams } from "react-router-dom";
import { adminService, cityService } from "@/api/services";
import { OCCURRENCE_STATUS } from "@/lib/enums";
import { formatDateTime, toApiDateTimeMs } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReadOnlyField } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import PaginationControls from "@/components/common/PaginationControls";
import PaginatedCitySelect from "@/components/common/PaginatedCitySelect";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const initialForm = {
  start_time: "",
  end_time: "",
  venue_id: "",
  provider_sub_location: "",
  capacity_total: "",
  price: "0",
  ticket_pricing_json: "{\n  \"STANDARD\": 0\n}",
  seat_layout_json: "",
};
const OCCURRENCES_PAGE_SIZE = 20;

const validationSchema = Yup.object({
  start_time: Yup.string().required("Start time is required."),
  end_time: Yup.string(),
  venue_id: Yup.string().trim().required("Venue is required."),
  provider_sub_location: Yup.string().max(180, "Sub-location is too long."),
  capacity_total: Yup.number().typeError("Capacity must be a number.").moreThan(0, "Capacity must be greater than 0.").required("Capacity is required."),
  price: Yup.number().typeError("Default ticket price must be a number.").min(0, "Default ticket price must be >= 0."),
  ticket_pricing_json: Yup.string().required("Ticket pricing metadata is required."),
  seat_layout_json: Yup.string(),
});

const parseJsonObject = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const parseJsonValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const toDateTimeInputValue = (value) => {
  if (!value) return "";
  const parsedMs = toApiDateTimeMs(value);
  if (!Number.isFinite(parsedMs)) return "";
  const parsed = new Date(parsedMs);
  const localTime = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
};

const pad2 = (value) => String(value).padStart(2, "0");

const toLocalDateTimeInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const AdminOccurrencesPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listing, setListing] = useState(null);
  const [items, setItems] = useState([]);
  const [cities, setCities] = useState([]);
  const [occurrenceCityId, setOccurrenceCityId] = useState("");
  const [venues, setVenues] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [editingOccurrenceId, setEditingOccurrenceId] = useState("");
  const [filters, setFilters] = useState({ status: "", q: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [minDateTimeLocal, setMinDateTimeLocal] = useState(() =>
    toLocalDateTimeInputValue(new Date())
  );
  const isAllCitiesListing = Boolean(listing?.is_nationwide || !listing?.city_id);
  const occurrenceFormik = useFormik({
    initialValues: initialForm,
    validationSchema,
    onSubmit: async (values) => {
      if (!listingId) return;
      if (isAllCitiesListing && !occurrenceCityId) {
        setError("City is required for all-cities listing occurrences.");
        return;
      }

      const capacityTotal = Number(values.capacity_total || 0);
      const ticketPricing = parseJsonObject(values.ticket_pricing_json);
      const seatLayout = parseJsonValue(values.seat_layout_json);
      if (ticketPricing === null) {
        setError("Ticket pricing must be a valid JSON object.");
        return;
      }
      if (seatLayout === null) {
        setError("Seat layout must be valid JSON.");
        return;
      }

      const startDate = new Date(values.start_time);
      if (Number.isNaN(startDate.getTime())) {
        setError("Start time is invalid.");
        return;
      }
      if (!editingOccurrenceId && startDate.getTime() < Date.now()) {
        setError("Start time cannot be in the past.");
        return;
      }
      const endDate = values.end_time ? new Date(values.end_time) : null;
      if (endDate && Number.isNaN(endDate.getTime())) {
        setError("End time is invalid.");
        return;
      }

      const parsedPrice = Number(values.price || 0);
      const fallbackTicketPricing =
        ticketPricing && Object.keys(ticketPricing).length
          ? ticketPricing
          : { STANDARD: Number.isFinite(parsedPrice) ? parsedPrice : 0 };
      const occurrencePayload = {
        start_time: startDate.toISOString(),
        end_time: endDate ? endDate.toISOString() : null,
        venue_id: values.venue_id,
        provider_sub_location: values.provider_sub_location,
        capacity_total: capacityTotal,
        ticket_pricing: fallbackTicketPricing,
        seat_layout: seatLayout,
      };

      setSaving(true);
      setError("");
      try {
        if (editingOccurrenceId) {
          await adminService.updateOccurrence(editingOccurrenceId, occurrencePayload);
        } else {
          await adminService.createOccurrences(listingId, {
            occurrences: [occurrencePayload],
          });
        }
        occurrenceFormik.resetForm({
          values: { ...initialForm, venue_id: values.venue_id },
        });
        setEditingOccurrenceId("");
        setPage(1);
        setRefreshKey((prev) => prev + 1);
      } catch (err) {
        setError(err?.normalized?.message || "Unable to save occurrence.");
      } finally {
        setSaving(false);
      }
    },
  });
  const listingCityId = listing?.city_id ? String(listing.city_id) : "";
  const hasListing = Boolean(listing);
  const venueIdRef = useRef("");
  const setOccurrenceFieldValueRef = useRef(occurrenceFormik.setFieldValue);

  useEffect(() => {
    venueIdRef.current = occurrenceFormik.values.venue_id;
    setOccurrenceFieldValueRef.current = occurrenceFormik.setFieldValue;
  }, [occurrenceFormik.values.venue_id, occurrenceFormik.setFieldValue]);

  useEffect(() => {
    const timer = setInterval(() => {
      setMinDateTimeLocal(toLocalDateTimeInputValue(new Date()));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!listingId) return;
    let mounted = true;
    setLoading(true);
    setError("");

    Promise.all([
      adminService.getListingById(listingId),
      adminService.getOccurrences(listingId, {
        status: filters.status || undefined,
        q: filters.q || undefined,
        page,
        page_size: OCCURRENCES_PAGE_SIZE,
      }),
    ])
      .then(async ([listingResponse, occurrencesResponse]) => {
        if (!mounted) return;
        setListing(listingResponse);
        setItems(occurrencesResponse.items || []);
        setPageMeta({
          page: occurrencesResponse.page || page,
          total_pages: occurrencesResponse.total_pages || 1,
          total: occurrencesResponse.total || 0,
        });

        if (listingResponse?.city_id) {
          setCities([]);
          setOccurrenceCityId(String(listingResponse.city_id));
        } else {
          const citiesResponse = await cityService.getCities();
          if (!mounted) return;
          const nextCities = (citiesResponse.items || []).filter((city) => {
            const normalized = String(city.name || "").trim().toLowerCase();
            return normalized !== "all india" && normalized !== "nationwide";
          });
          setCities(nextCities);
          setOccurrenceCityId((prev) => (prev && nextCities.some((city) => city.id === prev) ? prev : nextCities[0]?.id || ""));
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Failed to load occurrences.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [listingId, filters, page, refreshKey]);

  const availableStatus = useMemo(
    () => [OCCURRENCE_STATUS.SCHEDULED, OCCURRENCE_STATUS.CANCELLED, OCCURRENCE_STATUS.SOLD_OUT, OCCURRENCE_STATUS.ARCHIVED],
    []
  );

  useEffect(() => {
    setPage(1);
    setEditingOccurrenceId("");
    setFilters({ status: "", q: "" });
    setSearchDraft("");
  }, [listingId]);

  const onApplySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters((prev) => ({ ...prev, q: searchDraft.trim() }));
  };

  const onResetFilters = () => {
    setSearchDraft("");
    setPage(1);
    setFilters({ status: "", q: "" });
  };

  useEffect(() => {
    if (!hasListing) return;
    let mounted = true;

    const cityToUse = listingCityId || occurrenceCityId;
    if (!cityToUse) {
      setVenues([]);
      if (venueIdRef.current) {
        setOccurrenceFieldValueRef.current("venue_id", "");
      }
      return undefined;
    }

    cityService
      .getVenues({ city_id: cityToUse })
      .then((response) => {
        if (!mounted) return;
        const nextVenues = response.items || [];
        setVenues(nextVenues);
        if (!venueIdRef.current || !nextVenues.some((venue) => venue.id === venueIdRef.current)) {
          setOccurrenceFieldValueRef.current("venue_id", nextVenues[0]?.id || "");
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Unable to load venues.");
      });

    return () => {
      mounted = false;
    };
  }, [hasListing, listingCityId, occurrenceCityId]);

  const onEditOccurrence = (occurrence) => {
    setError("");
    setEditingOccurrenceId(occurrence.id);
    if (isAllCitiesListing && occurrence.city_id) {
      setOccurrenceCityId(String(occurrence.city_id));
    }

    const nextTicketPricing =
      occurrence.ticket_pricing && Object.keys(occurrence.ticket_pricing).length
        ? occurrence.ticket_pricing
        : { STANDARD: 0 };
    const firstPrice = Object.values(nextTicketPricing)[0];

    occurrenceFormik.setValues({
      start_time: toDateTimeInputValue(occurrence.start_time),
      end_time: toDateTimeInputValue(occurrence.end_time),
      venue_id: occurrence.venue_id || "",
      provider_sub_location: occurrence.provider_sub_location || "",
      capacity_total: String(occurrence.capacity_total ?? ""),
      price: String(Number(firstPrice ?? 0)),
      ticket_pricing_json: JSON.stringify(nextTicketPricing, null, 2),
      seat_layout_json: occurrence.seat_layout ? JSON.stringify(occurrence.seat_layout, null, 2) : "",
    });
  };

  const onResetOccurrenceForm = () => {
    setEditingOccurrenceId("");
    occurrenceFormik.resetForm({
      values: {
        ...initialForm,
        venue_id: occurrenceFormik.values.venue_id || venues[0]?.id || "",
      },
    });
  };

  const onCancelOccurrence = async (occurrenceId) => {
    const reason = window.prompt("Reason for cancellation", "Venue maintenance");
    if (reason === null) return;
    setError("");
    try {
      await adminService.cancelOccurrence(occurrenceId, reason);
      if (editingOccurrenceId === occurrenceId) {
        onResetOccurrenceForm();
      }
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to cancel occurrence.");
    }
  };

  const occurrenceColumns = [
    {
      accessorKey: "start_time",
      header: "Start",
      cell: ({ row }) => formatDateTime(row.original.start_time),
    },
    {
      accessorKey: "end_time",
      header: "End",
      cell: ({ row }) => formatDateTime(row.original.end_time),
    },
    {
      accessorKey: "city_id",
      header: "City",
      cell: ({ row }) =>
        cities.find((city) => city.id === row.original.city_id)?.name ||
        (String(row.original.city_id) === String(listing?.city_id) ? listing?.city : "--"),
    },
    {
      accessorKey: "venue_name",
      header: "Venue",
      cell: ({ row }) => row.original.venue_name || "--",
    },
    {
      accessorKey: "provider_sub_location",
      header: "Location",
      cell: ({ row }) => row.original.provider_sub_location || "--",
    },
    {
      id: "capacity",
      header: "Capacity",
      cell: ({ row }) =>
        `${Number(row.original.capacity_remaining || 0).toLocaleString("en-IN")} / ${Number(
          row.original.capacity_total || 0
        ).toLocaleString("en-IN")}`,
    },
    {
      accessorKey: "ticket_pricing",
      header: "Ticket pricing",
      cell: ({ row }) =>
        row.original.ticket_pricing && Object.keys(row.original.ticket_pricing).length
          ? JSON.stringify(row.original.ticket_pricing)
          : "--",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (availableStatus.includes(row.original.status) ? row.original.status : "--"),
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => onEditOccurrence(row.original)}>
            Edit
          </Button>
          {row.original.status === OCCURRENCE_STATUS.SCHEDULED ? (
            <Button size="sm" variant="destructive" onClick={() => onCancelOccurrence(row.original.id)}>
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Occurrences / Slots"
        description={
          listing
            ? `Listing: ${listing.title}`
            : "Manage occurrence schedule and cancellations."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/admin/listings")}>
              Back to listings
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/bookings")}>
              Open bookings
            </Button>
          </>
        }
      />

      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading occurrences...</AdminInlineState> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{editingOccurrenceId ? "Edit occurrence" : "Create occurrence"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={occurrenceFormik.handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start time <span className="text-destructive">*</span></p>
              <Input
                name="start_time"
                type="datetime-local"
                min={editingOccurrenceId ? undefined : minDateTimeLocal}
                value={occurrenceFormik.values.start_time}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
              />
              {occurrenceFormik.touched.start_time && occurrenceFormik.errors.start_time ? (
                <p className="text-xs text-destructive mt-1">{occurrenceFormik.errors.start_time}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">End time</p>
              <Input
                name="end_time"
                type="datetime-local"
                min={
                  occurrenceFormik.values.start_time ||
                  (editingOccurrenceId ? undefined : minDateTimeLocal)
                }
                value={occurrenceFormik.values.end_time}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
              />
            </div>
            {isAllCitiesListing ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">City <span className="text-destructive">*</span></p>
                <PaginatedCitySelect
                  cities={cities}
                  value={occurrenceCityId}
                  onChange={(nextValue) => {
                    setOccurrenceCityId(nextValue);
                    occurrenceFormik.setFieldValue("venue_id", "");
                  }}
                  required
                  includeEmptyOption={false}
                  searchPlaceholder="Search city"
                />
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1">City</p>
                <ReadOnlyField>
                  {listing?.city || "--"}
                </ReadOnlyField>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Venue <span className="text-destructive">*</span></p>
              <Select
                name="venue_id"
                value={occurrenceFormik.values.venue_id}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
                required
              >
                <option value="">Select venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                  ))}
              </Select>
              {occurrenceFormik.touched.venue_id && occurrenceFormik.errors.venue_id ? (
                <p className="text-xs text-destructive mt-1">{occurrenceFormik.errors.venue_id}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sub-location</p>
              <Input
                name="provider_sub_location"
                value={occurrenceFormik.values.provider_sub_location}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
                placeholder="Screen 3 / Main Arena"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Capacity total <span className="text-destructive">*</span></p>
              <Input
                name="capacity_total"
                type="number"
                value={occurrenceFormik.values.capacity_total}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
              />
              {occurrenceFormik.touched.capacity_total && occurrenceFormik.errors.capacity_total ? (
                <p className="text-xs text-destructive mt-1">{occurrenceFormik.errors.capacity_total}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Default ticket price (fallback)</p>
              <Input
                name="price"
                type="number"
                value={occurrenceFormik.values.price}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
              />
            </div>
            <div className="md:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">Ticket pricing metadata (JSON object) <span className="text-destructive">*</span></p>
              <Textarea
                name="ticket_pricing_json"
                value={occurrenceFormik.values.ticket_pricing_json}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
                className="min-h-[120px] font-mono"
                placeholder='{"STANDARD": 299, "PREMIUM": 599}'
              />
              {occurrenceFormik.touched.ticket_pricing_json && occurrenceFormik.errors.ticket_pricing_json ? (
                <p className="text-xs text-destructive mt-1">{occurrenceFormik.errors.ticket_pricing_json}</p>
              ) : null}
            </div>
            <div className="md:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">Seat layout metadata (JSON object or array)</p>
              <Textarea
                name="seat_layout_json"
                value={occurrenceFormik.values.seat_layout_json}
                onChange={occurrenceFormik.handleChange}
                onBlur={occurrenceFormik.handleBlur}
                className="min-h-[120px] font-mono"
                placeholder='{"rows":["A","B"],"columns":10}'
              />
            </div>
            <div className="md:col-span-3">
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={saving || !occurrenceFormik.isValid}>
                  {saving ? (editingOccurrenceId ? "Updating..." : "Creating...") : editingOccurrenceId ? "Save changes" : "Create occurrence"}
                </Button>
                {editingOccurrenceId ? (
                  <Button type="button" variant="outline" onClick={onResetOccurrenceForm}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onApplySearch} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto_auto] gap-2 items-end">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, status: event.target.value }));
                }}
              >
                <option value="">All statuses</option>
                {availableStatus.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Search occurrences</p>
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search by venue, sub-location, or occurrence id"
              />
            </div>
            <Button type="submit">Search</Button>
            {filters.q || filters.status ? (
              <Button type="button" variant="outline" onClick={onResetFilters}>
                Clear
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Occurrence list</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <AdminEmptyState message="No occurrences found for this listing." />
          ) : null}
          {items.length > 0 ? (
            <>
              <AdminDataTable columns={occurrenceColumns} data={items} />
              <PaginationControls
                page={pageMeta.page}
                totalPages={pageMeta.total_pages}
                totalItems={pageMeta.total}
                disabled={loading}
                onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(pageMeta.total_pages || 1, prev + 1))}
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOccurrencesPage;
