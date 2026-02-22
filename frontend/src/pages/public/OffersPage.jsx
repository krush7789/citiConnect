import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { offerService } from "@/api/services";
import PaginationControls from "@/components/common/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import useSelectedCity from "@/hooks/useSelectedCity";
import { formatCurrency, formatDateOnly } from "@/lib/format";

const OFFERS_PAGE_SIZE = 12;

const typeOptions = [
  { value: "ALL", label: "All types" },
  { value: "EVENT", label: "Events" },
  { value: "MOVIE", label: "Movies" },
  { value: "RESTAURANT", label: "Dining" },
  { value: "ACTIVITY", label: "Activities" },
];

const formatDiscountLabel = (offer) => {
  const discountType = String(offer.discount_type || "").toUpperCase();
  if (discountType === "PERCENT" || discountType === "PERCENTAGE") {
    return `${Number(offer.discount_value || 0)}% OFF`;
  }
  return `${formatCurrency(offer.discount_value || 0)} OFF`;
};

const toApplicableTypes = (offer) => {
  const types = offer?.applicability?.types;
  if (!Array.isArray(types)) return [];
  return types.map((type) => String(type || "").trim().toUpperCase()).filter(Boolean);
};

const validationSchema = Yup.object({
  q: Yup.string().max(120, "Search query is too long."),
  type: Yup.string().oneOf(typeOptions.map((option) => option.value), "Invalid type filter."),
});

const OffersPage = () => {
  const cityId = useSelectedCity();
  const [params, setParams] = useSearchParams();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageMeta, setPageMeta] = useState({ page: 1, total_pages: 1, total: 0 });

  const q = params.get("q") || "";
  const selectedType = params.get("type") || "ALL";
  const page = Math.max(1, Number(params.get("page") || 1));

  const filterForm = useFormik({
    initialValues: { q, type: selectedType },
    enableReinitialize: true,
    validationSchema,
    onSubmit: (values) => {
      const next = new URLSearchParams(params);
      const trimmed = values.q.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      if (values.type && values.type !== "ALL") next.set("type", values.type);
      else next.delete("type");
      next.set("page", "1");
      setParams(next);
    },
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    offerService
      .getOffers({
        city_id: cityId || undefined,
        q: q || undefined,
        type: selectedType !== "ALL" ? selectedType : undefined,
        current_only: true,
        page,
        page_size: OFFERS_PAGE_SIZE,
      })
      .then((response) => {
        if (!mounted) return;
        setOffers(response.items || []);
        setPageMeta({
          page: response.page || page,
          total_pages: response.total_pages || 1,
          total: response.total || 0,
        });
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
  }, [cityId, q, selectedType, page]);

  const summaryText = useMemo(() => {
    if (!q && selectedType === "ALL") return "Search available offers and coupon codes.";
    const labels = [];
    if (q) labels.push(`query "${q}"`);
    if (selectedType !== "ALL") labels.push(`type ${selectedType}`);
    return `Showing offers for ${labels.join(" and ")}.`;
  }, [q, selectedType]);

  const resetFilters = () => {
    filterForm.resetForm({ values: { q: "", type: "ALL" } });
    const next = new URLSearchParams(params);
    next.delete("q");
    next.delete("type");
    next.set("page", "1");
    setParams(next);
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Offers</h1>
        <p className="text-sm text-muted-foreground mt-1">{summaryText}</p>
        {cityId ? (
          <p className="text-xs text-muted-foreground mt-1">Results are scoped to your selected city.</p>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={filterForm.handleSubmit} className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto_auto] gap-3">
            <div className="space-y-1">
              <Input
                name="q"
                value={filterForm.values.q}
                onChange={filterForm.handleChange}
                onBlur={filterForm.handleBlur}
                placeholder="Search by code or title"
              />
              {filterForm.touched.q && filterForm.errors.q ? <p className="text-xs text-destructive">{filterForm.errors.q}</p> : null}
            </div>
            <Select
              name="type"
              value={filterForm.values.type}
              onChange={filterForm.handleChange}
              onBlur={filterForm.handleBlur}
              showIcon
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={!filterForm.isValid}>Search</Button>
            <Button type="button" variant="outline" onClick={resetFilters}>
              Reset
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading offers...</p> : null}

      {!loading && !offers.length ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          No offers found for the selected filters.
        </div>
      ) : null}

      {offers.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {offers.map((offer) => {
            const applicableTypes = toApplicableTypes(offer);
            return (
              <Card key={offer.id} className="h-full">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{offer.title || offer.code}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Code: <span className="font-mono font-semibold">{offer.code || "--"}</span>
                      </p>
                    </div>
                    <Badge variant={offer.is_current ? "default" : "secondary"}>
                      {offer.is_current ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground min-h-10">
                    {offer.description || "Apply this coupon at checkout to claim the discount."}
                  </p>
                  <p className="text-2xl font-bold">{formatDiscountLabel(offer)}</p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <p>Min order: {offer.min_order_value !== null ? formatCurrency(offer.min_order_value) : "None"}</p>
                    <p>Max discount: {offer.max_discount_value !== null ? formatCurrency(offer.max_discount_value) : "No cap"}</p>
                    <p>Valid from: {formatDateOnly(offer.valid_from)}</p>
                    <p>Valid until: {formatDateOnly(offer.valid_until)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {applicableTypes.length ? (
                      applicableTypes.map((type) => (
                        <Badge key={`${offer.id}-${type}`} variant="outline">
                          {type}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">All listing types</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <PaginationControls
        page={pageMeta.page}
        totalPages={pageMeta.total_pages}
        totalItems={pageMeta.total}
        disabled={loading}
        onPrevious={() => {
          const next = new URLSearchParams(params);
          next.set("page", String(Math.max(1, pageMeta.page - 1)));
          setParams(next);
        }}
        onNext={() => {
          const next = new URLSearchParams(params);
          next.set("page", String(Math.min(pageMeta.total_pages || 1, pageMeta.page + 1)));
          setParams(next);
        }}
      />
    </div>
  );
};

export default OffersPage;
