import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminService, cityService } from "@/api/services";
import { OCCURRENCE_STATUS } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialForm = {
  start_time: "",
  end_time: "",
  venue_id: "",
  provider_sub_location: "",
  capacity_total: "",
  price: "",
};

const AdminOccurrencesPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listing, setListing] = useState(null);
  const [items, setItems] = useState([]);
  const [venues, setVenues] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!listingId) return;
    let mounted = true;
    setLoading(true);
    setError("");

    Promise.all([adminService.getListingById(listingId), adminService.getOccurrences(listingId, { page: 1, page_size: 200 })])
      .then(async ([listingResponse, occurrencesResponse]) => {
        if (!mounted) return;
        setListing(listingResponse);
        setItems(occurrencesResponse.items || []);

        if (listingResponse?.city_id) {
          const venuesResponse = await cityService.getVenues({ city_id: listingResponse.city_id });
          if (!mounted) return;
          const nextVenues = venuesResponse.items || [];
          setVenues(nextVenues);
          setForm((prev) => (prev.venue_id || !nextVenues[0] ? prev : { ...prev, venue_id: nextVenues[0].id }));
        } else {
          setVenues([]);
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
  }, [listingId, refreshKey]);

  const availableStatus = useMemo(
    () => [OCCURRENCE_STATUS.SCHEDULED, OCCURRENCE_STATUS.CANCELLED, OCCURRENCE_STATUS.SOLD_OUT, OCCURRENCE_STATUS.ARCHIVED],
    []
  );

  const onCreateOccurrence = async (event) => {
    event.preventDefault();
    if (!listingId) return;
    setSaving(true);
    setError("");
    try {
      await adminService.createOccurrences(listingId, {
        occurrences: [
          {
            start_time: new Date(form.start_time).toISOString(),
            end_time: new Date(form.end_time).toISOString(),
            venue_id: form.venue_id,
            provider_sub_location: form.provider_sub_location,
            capacity_total: Number(form.capacity_total || 0),
            ticket_pricing: { STANDARD: Number(form.price || 0) },
          },
        ],
      });
      setForm((prev) => ({ ...initialForm, venue_id: prev.venue_id }));
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to create occurrence.");
    } finally {
      setSaving(false);
    }
  };

  const onCancelOccurrence = async (occurrenceId) => {
    const reason = window.prompt("Reason for cancellation", "Venue maintenance");
    if (reason === null) return;
    setError("");
    try {
      await adminService.cancelOccurrence(occurrenceId, reason);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to cancel occurrence.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Occurrences / Slots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {listing ? (
              <>
                Listing: <span className="font-semibold text-foreground">{listing.title}</span>
              </>
            ) : (
              "Manage occurrence schedule and cancellations."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/listings")}>
            Back to listings
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/bookings")}>
            Open bookings
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading occurrences...</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create occurrence</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateOccurrence} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start time</p>
              <Input
                type="datetime-local"
                value={form.start_time}
                onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
                required
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">End time</p>
              <Input
                type="datetime-local"
                value={form.end_time}
                onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
                required
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Venue</p>
              <select
                value={form.venue_id}
                onChange={(event) => setForm((prev) => ({ ...prev, venue_id: event.target.value }))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                required
              >
                <option value="">Select venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sub-location</p>
              <Input
                value={form.provider_sub_location}
                onChange={(event) => setForm((prev) => ({ ...prev, provider_sub_location: event.target.value }))}
                placeholder="Screen 3 / Main Arena"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Capacity total</p>
              <Input
                type="number"
                value={form.capacity_total}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity_total: event.target.value }))}
                required
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Default ticket price</p>
              <Input
                type="number"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create occurrence"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Occurrence list</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <div className="rounded-lg border p-5 text-sm text-muted-foreground">No occurrences found for this listing.</div>
          ) : null}
          {items.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Start</th>
                    <th className="text-left p-3">End</th>
                    <th className="text-left p-3">Venue</th>
                    <th className="text-left p-3">Location</th>
                    <th className="text-left p-3">Capacity</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((occurrence) => (
                    <tr key={occurrence.id} className="border-t">
                      <td className="p-3">{formatDateTime(occurrence.start_time)}</td>
                      <td className="p-3">{formatDateTime(occurrence.end_time)}</td>
                      <td className="p-3">{occurrence.venue_name || "--"}</td>
                      <td className="p-3">{occurrence.provider_sub_location || "--"}</td>
                      <td className="p-3">
                        {Number(occurrence.capacity_remaining || 0).toLocaleString("en-IN")} /{" "}
                        {Number(occurrence.capacity_total || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3">{availableStatus.includes(occurrence.status) ? occurrence.status : "--"}</td>
                      <td className="p-3">
                        {occurrence.status === OCCURRENCE_STATUS.SCHEDULED ? (
                          <Button size="sm" variant="destructive" onClick={() => onCancelOccurrence(occurrence.id)}>
                            Cancel
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
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

export default AdminOccurrencesPage;
