import React, { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Link } from "react-router-dom";
import { adminService, cityService, mediaService } from "@/api/services";
import { LISTING_STATUS, LISTING_TYPE } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReadOnlyField } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import PaginationControls from "@/components/common/PaginationControls";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";
import AdminListingForm from "./components/AdminListingForm";

const defaultForm = {
  id: "",
  type: LISTING_TYPE.EVENT,
  title: "",
  description: "",
  city_id: "",
  venue_id: "",
  category: "",
  price_min: "",
  price_max: "",
  currency: "INR",
  status: LISTING_STATUS.DRAFT,
  is_featured: false,
  offer_text: "",
  cover_image_url: "",
  gallery_urls_text: "",
  metadata_text: "{}",
  vibe_tags_text: "",
};

const listingTypes = Object.values(LISTING_TYPE);
const listingStatuses = Object.values(LISTING_STATUS);
const LISTINGS_PAGE_SIZE = 20;

const metadataTemplates = {
  [LISTING_TYPE.MOVIE]: {
    language: "Hindi",
    certification: "U/A",
    duration_min: 120,
    director: "",
    cast: [],
    release_type: "2D",
  },
  [LISTING_TYPE.EVENT]: {
    genre: "",
    artists: [],
    age_restriction: "",
    entry_gate: "",
    reporting_time: "",
    parking: "Available",
  },
  [LISTING_TYPE.RESTAURANT]: {
    cuisine: "",
    avg_cost_for_two: 0,
    rating: "",
    features: [],
    opening_hours: "",
    dress_code: "",
  },
  [LISTING_TYPE.ACTIVITY]: {
    difficulty: "",
    duration: "",
    includes: [],
    age_limit: "",
    what_to_carry: [],
  },
};

const toOptionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const trimmedOrUndefined = (value) => {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

const parseStringList = (value) =>
  [...new Set(String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];

const parseMetadataJson = (value) => {
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

const validationSchema = Yup.object({
  type: Yup.string().required("Type is required."),
  title: Yup.string().trim().required("Listing title is required."),
  status: Yup.string().required("Status is required."),
  price_min: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Price min must be >= 0."),
  price_max: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Price max must be >= 0."),
  metadata_text: Yup.string().required("Metadata JSON is required."),
}).test("price-order", "Price max must be greater than or equal to price min.", (values) => {
  if (!values) return true;
  const min = values.price_min === "" ? null : Number(values.price_min);
  const max = values.price_max === "" ? null : Number(values.price_max);
  if (min === null || Number.isNaN(min) || max === null || Number.isNaN(max)) return true;
  return max >= min;
});

const AdminListingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ type: "", status: "", city: "", q: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [cities, setCities] = useState([]);
  const [venues, setVenues] = useState([]);
  const [formMode, setFormMode] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [editingLoadId, setEditingLoadId] = useState("");
  const listingFormik = useFormik({
    initialValues: defaultForm,
    validationSchema,
    validateOnMount: true,
    onSubmit: async (values) => {
      const title = trimmedOrUndefined(values.title);
      const cityId = trimmedOrUndefined(values.city_id) || null;
      const venueId = trimmedOrUndefined(values.venue_id) || null;
      const priceMin = toOptionalNumber(values.price_min);
      const priceMaxInput = toOptionalNumber(values.price_max);
      const priceMax = priceMaxInput ?? priceMin;
      const metadata = parseMetadataJson(values.metadata_text);
      const vibeTags = parseStringList(values.vibe_tags_text);
      const galleryImageUrls = parseStringList(values.gallery_urls_text);
      const coverImageUrl = trimmedOrUndefined(values.cover_image_url) || galleryImageUrls[0];

      if (!title) {
        setError("Listing title is required.");
        return;
      }
      if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
        setError("Price max must be greater than or equal to price min.");
        return;
      }
      if (metadata === null) {
        setError("Metadata must be a valid JSON object.");
        return;
      }

      const payload = {
        type: values.type,
        title,
        description: trimmedOrUndefined(values.description),
        city_id: cityId,
        venue_id: venueId,
        category: trimmedOrUndefined(values.category),
        price_min: priceMin,
        price_max: priceMax,
        currency: values.currency,
        status: values.status,
        is_featured: values.is_featured,
        offer_text: trimmedOrUndefined(values.offer_text),
        cover_image_url: coverImageUrl,
        gallery_image_urls: galleryImageUrls.length ? galleryImageUrls : undefined,
        metadata: metadata || {},
        vibe_tags: vibeTags.length ? vibeTags : undefined,
      };

      setSaving(true);
      setError("");
      try {
        if (formMode === "create") {
          await adminService.createListing(payload);
        } else if (formMode === "edit") {
          await adminService.updateListing(values.id, payload);
        }
        setFormMode("");
        listingFormik.resetForm({ values: defaultForm });
        setPage(1);
        setRefreshKey((prev) => prev + 1);
      } catch (err) {
        setError(err?.normalized?.message || "Unable to save listing.");
      } finally {
        setSaving(false);
      }
    },
  });
  const listingValues = listingFormik.values;
  const setListingFieldValue = listingFormik.setFieldValue;

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === listingValues.city_id),
    [cities, listingValues.city_id]
  );
  const galleryUrls = useMemo(() => parseStringList(listingValues.gallery_urls_text), [listingValues.gallery_urls_text]);

  useEffect(() => {
    let mounted = true;
    cityService
      .getCities()
      .then((response) => {
        if (!mounted) return;
        setCities(response.items || []);
      })
      .catch(() => {
        if (mounted) setCities([]);
      });
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!listingValues.city_id) return;
    if (cities.some((city) => city.id === listingValues.city_id)) return;
    setListingFieldValue("city_id", "", false);
    setListingFieldValue("venue_id", "", false);
  }, [cities, listingValues.city_id, setListingFieldValue]);

  useEffect(() => {
    const selectedCityId = listingValues.city_id;
    if (!selectedCityId) {
      setVenues([]);
      if (listingValues.venue_id) {
        setListingFieldValue("venue_id", "", false);
      }
      return;
    }

    let mounted = true;
    cityService
      .getVenues({ city_id: selectedCityId })
      .then((response) => {
        if (!mounted) return;
        const nextVenues = response.items || [];
        setVenues(nextVenues);
        if (listingValues.venue_id && !nextVenues.some((venue) => venue.id === listingValues.venue_id)) {
          setListingFieldValue("venue_id", "", false);
        }
      })
      .catch(() => {
        if (mounted) setVenues([]);
      });
    return () => {
      mounted = false;
    };
  }, [listingValues.city_id, listingValues.venue_id, setListingFieldValue]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    adminService
      .getListings({
        type: filters.type || undefined,
        status: filters.status || undefined,
        city: filters.city || undefined,
        q: filters.q || undefined,
        page,
        page_size: LISTINGS_PAGE_SIZE,
      })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
        setPageMeta({
          page: response.page || page,
          total_pages: response.total_pages || 1,
          total: response.total || 0,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Failed to load listings.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [filters, page, refreshKey]);

  const openCreate = () => {
    setFormMode("create");
    setError("");
    listingFormik.resetForm({
      values: {
        ...defaultForm,
        metadata_text: JSON.stringify(metadataTemplates[LISTING_TYPE.EVENT], null, 2),
      },
    });
  };

  const onApplySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters((prev) => ({ ...prev, q: searchDraft.trim() }));
  };

  const onClearSearch = () => {
    setSearchDraft("");
    setPage(1);
    setFilters((prev) => ({ ...prev, q: "" }));
  };

  const openEdit = async (listing) => {
    setEditingLoadId(listing.id);
    setError("");
    try {
      const detail = await adminService.getListingById(listing.id);
      const nextGallery = Array.isArray(detail.gallery_image_urls) ? detail.gallery_image_urls : [];
      const fallbackCover = (detail.cover_image_url || "").trim() || nextGallery[0] || "";
      setFormMode("edit");
      listingFormik.resetForm({
        values: {
          id: detail.id || "",
          type: detail.type || LISTING_TYPE.EVENT,
          title: detail.title || "",
          description: detail.description || "",
          city_id: detail.city_id || "",
          venue_id: detail.venue_id || "",
          category: detail.category || "",
          price_min: detail.price_min ?? "",
          price_max: detail.price_max ?? "",
          currency: detail.currency || "INR",
          status: detail.status || LISTING_STATUS.DRAFT,
          is_featured: Boolean(detail.is_featured),
          offer_text: detail.offer_text || "",
          cover_image_url: fallbackCover,
          gallery_urls_text: nextGallery.join("\n"),
          metadata_text: JSON.stringify(detail.metadata || {}, null, 2),
          vibe_tags_text: Array.isArray(detail.vibe_tags) ? detail.vibe_tags.join(", ") : "",
        },
      });
    } catch (err) {
      setError(err?.normalized?.message || "Unable to load listing details.");
    } finally {
      setEditingLoadId("");
    }
  };

  const onUploadCover = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setUploadingCover(true);
    setError("");
    try {
      const upload = await mediaService.uploadImage(selected, { folder: "listing-cover" });
      listingFormik.setFieldValue("cover_image_url", upload?.url || listingFormik.values.cover_image_url);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to upload cover image.");
    } finally {
      setUploadingCover(false);
      event.target.value = "";
    }
  };

  const onUploadGallery = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploadingGallery(true);
    setError("");
    try {
      const uploads = await Promise.all(files.map((file) => mediaService.uploadImage(file, { folder: "listing-gallery" })));
      const uploadedUrls = uploads.map((item) => item?.url).filter(Boolean);
      const merged = [...new Set([...parseStringList(listingFormik.values.gallery_urls_text), ...uploadedUrls])];
      listingFormik.setFieldValue("gallery_urls_text", merged.join("\n"));
      if (!trimmedOrUndefined(listingFormik.values.cover_image_url) && merged[0]) {
        listingFormik.setFieldValue("cover_image_url", merged[0]);
      }
    } catch (err) {
      setError(err?.normalized?.message || "Unable to upload gallery images.");
    } finally {
      setUploadingGallery(false);
      event.target.value = "";
    }
  };

  const useTypeTemplate = () => {
    const template = metadataTemplates[listingFormik.values.type] || {};
    listingFormik.setFieldValue("metadata_text", JSON.stringify(template, null, 2));
  };

  const onCancelForm = () => {
    setFormMode("");
    setError("");
    listingFormik.resetForm({ values: defaultForm });
  };

  const onArchive = async (listingId) => {
    const confirmed = window.confirm("Archive this listing? This sets status to ARCHIVED.");
    if (!confirmed) return;
    setError("");
    try {
      await adminService.archiveListing(listingId);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to archive listing.");
    }
  };

  const listingColumns = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold">{row.original.title}</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">{row.original.id}</p>
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
    },
    {
      accessorKey: "city",
      header: "City",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "total_bookings",
      header: "Bookings",
      cell: ({ row }) => Number(row.original.total_bookings || 0).toLocaleString("en-IN"),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => formatDateOnly(row.original.created_at),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(editingLoadId)}
            onClick={() => openEdit(row.original)}
          >
            {editingLoadId === row.original.id ? "Loading..." : "Edit"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/admin/listings/${row.original.id}/occurrences`}>Occurrences</Link>
          </Button>
          {row.original.status !== LISTING_STATUS.ARCHIVED ? (
            <Button size="sm" variant="destructive" onClick={() => onArchive(row.original.id)}>
              Archive
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Listings Management"
        description="Filter, edit, archive listings, and jump to occurrence management."
        actions={<Button onClick={openCreate}>Create listing</Button>}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <Select
                value={filters.type}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, type: event.target.value }));
                }}
              >
                <option value="">All</option>
                {listingTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, status: event.target.value }));
                }}
              >
                <option value="">All</option>
                {listingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">City</p>
              <Select
                value={filters.city}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, city: event.target.value }));
                }}
              >
                <option value="">All</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <form onSubmit={onApplySearch} className="mt-3 flex flex-col md:flex-row md:items-end gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Search listings</p>
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search by title, category, or listing id"
              />
            </div>
            <Button type="submit" className="md:min-w-28">
              Search
            </Button>
            {filters.q ? (
              <Button type="button" variant="outline" onClick={onClearSearch}>
                Clear
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <AdminListingForm
        formMode={formMode}
        listingFormik={listingFormik}
        listingTypes={listingTypes}
        listingStatuses={listingStatuses}
        cities={cities}
        venues={venues}
        selectedCity={selectedCity}
        saving={saving}
        uploadingCover={uploadingCover}
        uploadingGallery={uploadingGallery}
        galleryUrls={galleryUrls}
        trimmedOrUndefined={trimmedOrUndefined}
        onUploadCover={onUploadCover}
        onUploadGallery={onUploadGallery}
        useTypeTemplate={useTypeTemplate}
        onCancelForm={onCancelForm}
      />

      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Listings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <AdminInlineState>Loading listings...</AdminInlineState> : null}
          {!loading && !items.length ? (
            <AdminEmptyState message="No listings found." />
          ) : null}
          {items.length > 0 ? (
            <>
              <AdminDataTable columns={listingColumns} data={items} />
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

export default AdminListingsPage;
