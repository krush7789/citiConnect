import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminService, cityService } from "@/api/services";
import { LISTING_STATUS, LISTING_TYPE } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
};

const listingTypes = Object.values(LISTING_TYPE);
const listingStatuses = Object.values(LISTING_STATUS);

const AdminListingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ type: "", status: "", city: "" });
  const [cities, setCities] = useState([]);
  const [venues, setVenues] = useState([]);
  const [formMode, setFormMode] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === form.city_id),
    [cities, form.city_id]
  );

  useEffect(() => {
    let mounted = true;
    cityService.getCities().then((response) => {
      if (!mounted) return;
      const nextCities = response.items || [];
      setCities(nextCities);
      setForm((prev) => (prev.city_id || !nextCities[0] ? prev : { ...prev, city_id: nextCities[0].id }));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!form.city_id) {
      setVenues([]);
      return;
    }
    let mounted = true;
    cityService.getVenues({ city_id: form.city_id }).then((response) => {
      if (!mounted) return;
      const nextVenues = response.items || [];
      setVenues(nextVenues);
      if (!nextVenues.find((venue) => venue.id === form.venue_id) && nextVenues[0]) {
        setForm((prev) => ({ ...prev, venue_id: nextVenues[0].id }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [form.city_id, form.venue_id]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    adminService
      .getListings({
        type: filters.type || undefined,
        status: filters.status || undefined,
        city: filters.city || undefined,
        page: 1,
        page_size: 200,
      })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
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
  }, [filters, refreshKey]);

  const openCreate = () => {
    setFormMode("create");
    setForm({
      ...defaultForm,
      city_id: cities[0]?.id || "",
      venue_id: "",
    });
  };

  const openEdit = (listing) => {
    setFormMode("edit");
    setForm({
      id: listing.id,
      type: listing.type || LISTING_TYPE.EVENT,
      title: listing.title || "",
      description: listing.description || "",
      city_id: listing.city_id || "",
      venue_id: listing.venue_id || "",
      category: listing.category || "",
      price_min: listing.price_min ?? "",
      price_max: listing.price_max ?? "",
      currency: listing.currency || "INR",
      status: listing.status || LISTING_STATUS.DRAFT,
      is_featured: Boolean(listing.is_featured),
      offer_text: listing.offer_text || "",
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (formMode === "create") {
        await adminService.createListing({
          type: form.type,
          title: form.title,
          description: form.description,
          city_id: form.city_id,
          venue_id: form.venue_id,
          category: form.category,
          price_min: Number(form.price_min || 0),
          price_max: Number(form.price_max || 0),
          currency: form.currency,
          status: form.status,
          is_featured: form.is_featured,
          offer_text: form.offer_text,
        });
      } else if (formMode === "edit") {
        await adminService.updateListing(form.id, {
          title: form.title,
          description: form.description,
          category: form.category,
          price_min: Number(form.price_min || 0),
          price_max: Number(form.price_max || 0),
          status: form.status,
          is_featured: form.is_featured,
          offer_text: form.offer_text,
        });
      }
      setFormMode("");
      setForm(defaultForm);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to save listing.");
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Listings Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filter, edit, archive listings, and jump to occurrence management.
          </p>
        </div>
        <Button onClick={openCreate}>Create listing</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <select
                value={filters.type}
                onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {listingTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {listingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">City</p>
              <select
                value={filters.city}
                onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {formMode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {formMode === "create" ? "Create listing" : `Edit listing: ${form.title || form.id}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Type</p>
                  <select
                    value={form.type}
                    onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                    disabled={formMode === "edit"}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                  >
                    {listingTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">City</p>
                  <select
                    value={form.city_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, city_id: event.target.value }))}
                    disabled={formMode === "edit"}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                  >
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Venue</p>
                  <select
                    value={form.venue_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, venue_id: event.target.value }))}
                    disabled={formMode === "edit"}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                  >
                    <option value="">Select venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Title</p>
                  <Input
                    value={form.title}
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Category</p>
                  <Input
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-[88px] w-full rounded-md border bg-background p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Price min</p>
                  <Input
                    type="number"
                    value={form.price_min}
                    onChange={(event) => setForm((prev) => ({ ...prev, price_min: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Price max</p>
                  <Input
                    type="number"
                    value={form.price_max}
                    onChange={(event) => setForm((prev) => ({ ...prev, price_max: event.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <select
                    value={form.status}
                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {listingStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">City preview</p>
                  <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center text-sm">
                    {selectedCity ? selectedCity.name : "--"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="is_featured"
                  type="checkbox"
                  checked={Boolean(form.is_featured)}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_featured: event.target.checked }))}
                />
                <label htmlFor="is_featured" className="text-sm">
                  Featured listing
                </label>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Offer text</p>
                <Input
                  value={form.offer_text}
                  onChange={(event) => setForm((prev) => ({ ...prev, offer_text: event.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : formMode === "create" ? "Create listing" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormMode("");
                    setForm(defaultForm);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Listings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading listings...</p> : null}
          {!loading && !items.length ? (
            <div className="rounded-lg border p-5 text-sm text-muted-foreground">No listings found.</div>
          ) : null}
          {items.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">City</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Bookings</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((listing) => (
                    <tr key={listing.id} className="border-t align-top">
                      <td className="p-3">
                        <p className="font-semibold">{listing.title}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{listing.id}</p>
                      </td>
                      <td className="p-3">{listing.type}</td>
                      <td className="p-3">{listing.city}</td>
                      <td className="p-3">{listing.status}</td>
                      <td className="p-3">{Number(listing.total_bookings || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3">{formatDateOnly(listing.created_at)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => openEdit(listing)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/admin/listings/${listing.id}/occurrences`}>Occurrences</Link>
                          </Button>
                          {listing.status !== LISTING_STATUS.ARCHIVED ? (
                            <Button size="sm" variant="destructive" onClick={() => onArchive(listing.id)}>
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminListingsPage;
