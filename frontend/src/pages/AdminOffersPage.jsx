import React, { useEffect, useState } from "react";
import { adminService } from "@/api/services";
import { formatDateOnly } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialForm = {
  code: "",
  title: "",
  discount_type: "FLAT",
  discount_value: "",
  min_order_value: "",
  max_discount_value: "",
  valid_from: "",
  valid_until: "",
  usage_limit: "",
  user_usage_limit: "",
  is_active: true,
};

const AdminOffersPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    adminService
      .getOffers({ page: 1, page_size: 200 })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Failed to load offers.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const onCreateOffer = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminService.createOffer({
        code: form.code,
        title: form.title,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value || 0),
        min_order_value: Number(form.min_order_value || 0),
        max_discount_value: Number(form.max_discount_value || 0),
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : undefined,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : undefined,
        usage_limit: Number(form.usage_limit || 0),
        user_usage_limit: Number(form.user_usage_limit || 0),
        is_active: form.is_active,
      });
      setForm(initialForm);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to create offer.");
    } finally {
      setSaving(false);
    }
  };

  const toggleOfferState = async (offer) => {
    setError("");
    try {
      await adminService.updateOffer(offer.id, { is_active: !offer.is_active });
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err?.normalized?.message || "Unable to update offer.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Offers Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create offers and toggle active/inactive states.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading offers...</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create offer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateOffer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Code</p>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                  required
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Title</p>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Discount type</p>
                <select
                  value={form.discount_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, discount_type: event.target.value }))}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="FLAT">FLAT</option>
                  <option value="PERCENTAGE">PERCENTAGE</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Discount value</p>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(event) => setForm((prev) => ({ ...prev, discount_value: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Min order</p>
                <Input
                  type="number"
                  value={form.min_order_value}
                  onChange={(event) => setForm((prev) => ({ ...prev, min_order_value: event.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Max discount</p>
                <Input
                  type="number"
                  value={form.max_discount_value}
                  onChange={(event) => setForm((prev) => ({ ...prev, max_discount_value: event.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Valid from</p>
                <Input
                  type="datetime-local"
                  value={form.valid_from}
                  onChange={(event) => setForm((prev) => ({ ...prev, valid_from: event.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Valid until</p>
                <Input
                  type="datetime-local"
                  value={form.valid_until}
                  onChange={(event) => setForm((prev) => ({ ...prev, valid_until: event.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Usage limits</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={form.usage_limit}
                    onChange={(event) => setForm((prev) => ({ ...prev, usage_limit: event.target.value }))}
                    placeholder="Total"
                  />
                  <Input
                    type="number"
                    value={form.user_usage_limit}
                    onChange={(event) => setForm((prev) => ({ ...prev, user_usage_limit: event.target.value }))}
                    placeholder="Per user"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="create_offer_active"
                type="checkbox"
                checked={Boolean(form.is_active)}
                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              <label htmlFor="create_offer_active" className="text-sm">
                Offer is active
              </label>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create offer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Offers</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !items.length ? (
            <div className="rounded-lg border p-5 text-sm text-muted-foreground">No offers found.</div>
          ) : null}
          {items.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Code</th>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Discount</th>
                    <th className="text-left p-3">Min order</th>
                    <th className="text-left p-3">Valid until</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((offer) => (
                    <tr key={offer.id} className="border-t">
                      <td className="p-3 font-semibold">{offer.code}</td>
                      <td className="p-3">{offer.title}</td>
                      <td className="p-3">{offer.discount_type}</td>
                      <td className="p-3">{Number(offer.discount_value || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3">{Number(offer.min_order_value || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3">{formatDateOnly(offer.valid_until)}</td>
                      <td className="p-3">{offer.is_active ? "ACTIVE" : "INACTIVE"}</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => toggleOfferState(offer)}>
                          {offer.is_active ? "Deactivate" : "Activate"}
                        </Button>
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

export default AdminOffersPage;
