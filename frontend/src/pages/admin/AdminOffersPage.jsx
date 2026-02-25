import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormik } from "formik";
import * as Yup from "yup";
import { adminService } from "@/api/services";
import { formatDateOnly } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PaginationControls from "@/components/common/PaginationControls";
import AdminDataTable from "@/components/admin/AdminDataTable";
import { AdminEmptyState, AdminInlineState, AdminPageHeader } from "@/components/admin/AdminPagePrimitives";

const OFFER_AVAILABILITY_KEYS = ["types", "categories", "city_ids", "listing_ids"];
const offerAvailabilityTemplate = {
  types: [],
  categories: [],
  city_ids: [],
  listing_ids: [],
};

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
  applicability_text: JSON.stringify(offerAvailabilityTemplate, null, 2),
};
const OFFERS_PAGE_SIZE = 20;

const parseOfferAvailability = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const normalized = {};
    OFFER_AVAILABILITY_KEYS.forEach((key) => {
      if (!Array.isArray(parsed[key])) return;
      const entries = [
        ...new Set(
          parsed[key]
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .map((item) => (key === "types" || key === "categories" ? item.toUpperCase() : item))
        ),
      ];
      if (entries.length) normalized[key] = entries;
    });
    return normalized;
  } catch {
    return null;
  }
};

const validationSchema = Yup.object({
  code: Yup.string().trim().required("Code is required."),
  title: Yup.string().trim().required("Title is required."),
  discount_type: Yup.string().oneOf(["FLAT", "PERCENTAGE"]).required("Discount type is required."),
  discount_value: Yup.number().typeError("Discount value must be a number.").moreThan(0, "Discount value must be greater than 0.").required("Discount value is required."),
  min_order_value: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Min order must be >= 0."),
  max_discount_value: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Max discount must be >= 0."),
  usage_limit: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Usage limit must be >= 0."),
  user_usage_limit: Yup.number().nullable().transform((value, original) => (original === "" ? null : value)).min(0, "Per-user limit must be >= 0."),
  applicability_text: Yup.string().required("Offer availability metadata is required."),
});

const AdminOffersPage = () => {
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const offersQuery = useQuery({
    queryKey: ["admin-offers", page],
    queryFn: () => adminService.getOffers({ page, page_size: OFFERS_PAGE_SIZE }),
  });

  const createOfferMutation = useMutation({
    mutationFn: (payload) => adminService.createOffer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-offers"] });
    },
  });
  const toggleOfferMutation = useMutation({
    mutationFn: ({ id, is_active }) => adminService.updateOffer(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-offers"] });
    },
  });

  const items = offersQuery.data?.items || [];
  const pageMeta = useMemo(
    () => ({
      page: offersQuery.data?.page || page,
      total_pages: offersQuery.data?.total_pages || 1,
      total: offersQuery.data?.total || 0,
    }),
    [offersQuery.data, page]
  );
  const loading = offersQuery.isLoading;
  const saving = createOfferMutation.isPending;
  const formik = useFormik({
    initialValues: initialForm,
    validationSchema,
    onSubmit: async (values) => {
      setError("");
      const applicability = parseOfferAvailability(values.applicability_text);
      if (applicability === null) {
        setError("Offer availability metadata must be a valid JSON object.");
        return;
      }
      try {
        await createOfferMutation.mutateAsync({
          code: values.code,
          title: values.title,
          discount_type: values.discount_type,
          discount_value: Number(values.discount_value || 0),
          min_order_value: values.min_order_value === "" ? 0 : Number(values.min_order_value || 0),
          max_discount_value: values.max_discount_value === "" ? 0 : Number(values.max_discount_value || 0),
          valid_from: values.valid_from ? new Date(values.valid_from).toISOString() : undefined,
          valid_until: values.valid_until ? new Date(values.valid_until).toISOString() : undefined,
          usage_limit: values.usage_limit === "" ? 0 : Number(values.usage_limit || 0),
          user_usage_limit: values.user_usage_limit === "" ? 0 : Number(values.user_usage_limit || 0),
          is_active: values.is_active,
          applicability,
        });
        formik.resetForm();
        setPage(1);
      } catch (err) {
        setError(err?.normalized?.message || "Unable to create offer.");
      }
    },
  });

  const toggleOfferState = useCallback(async (offer) => {
    setError("");
    try {
      await toggleOfferMutation.mutateAsync({ id: offer.id, is_active: !offer.is_active });
    } catch (err) {
      setError(err?.normalized?.message || "Unable to update offer.");
    }
  }, [toggleOfferMutation]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-semibold">{row.original.code}</span>,
      },
      {
        accessorKey: "title",
        header: "Title",
      },
      {
        accessorKey: "discount_type",
        header: "Type",
      },
      {
        accessorKey: "discount_value",
        header: "Discount",
        cell: ({ row }) => Number(row.original.discount_value || 0).toLocaleString("en-IN"),
      },
      {
        accessorKey: "min_order_value",
        header: "Min order",
        cell: ({ row }) => Number(row.original.min_order_value || 0).toLocaleString("en-IN"),
      },
      {
        accessorKey: "valid_until",
        header: "Valid until",
        cell: ({ row }) => formatDateOnly(row.original.valid_until),
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (row.original.is_active ? "ACTIVE" : "INACTIVE"),
      },
      {
        id: "action",
        header: "Action",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => toggleOfferState(row.original)}>
            {row.original.is_active ? "Deactivate" : "Activate"}
          </Button>
        ),
      },
    ],
    [toggleOfferState]
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Offers Management"
        description="Create offers and toggle active/inactive states."
      />

      {offersQuery.error?.normalized?.message && !error ? (
        <AdminInlineState tone="error">{offersQuery.error.normalized.message}</AdminInlineState>
      ) : null}
      {error ? <AdminInlineState tone="error">{error}</AdminInlineState> : null}
      {loading ? <AdminInlineState>Loading offers...</AdminInlineState> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create offer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Code <span className="text-destructive">*</span></p>
                <Input
                  name="code"
                  value={formik.values.code}
                  onChange={(event) => formik.setFieldValue("code", event.target.value.toUpperCase())}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.code && formik.errors.code ? <p className="text-xs text-destructive mt-1">{formik.errors.code}</p> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Title <span className="text-destructive">*</span></p>
                <Input
                  name="title"
                  value={formik.values.title}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.title && formik.errors.title ? <p className="text-xs text-destructive mt-1">{formik.errors.title}</p> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Discount type <span className="text-destructive">*</span></p>
                <Select
                  name="discount_type"
                  value={formik.values.discount_type}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                >
                  <option value="FLAT">FLAT</option>
                  <option value="PERCENTAGE">PERCENTAGE</option>
                </Select>
                {formik.touched.discount_type && formik.errors.discount_type ? (
                  <p className="text-xs text-destructive mt-1">{formik.errors.discount_type}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Discount value <span className="text-destructive">*</span></p>
                <Input
                  name="discount_value"
                  type="number"
                  value={formik.values.discount_value}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.discount_value && formik.errors.discount_value ? (
                  <p className="text-xs text-destructive mt-1">{formik.errors.discount_value}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Min order</p>
                <Input
                  name="min_order_value"
                  type="number"
                  value={formik.values.min_order_value}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Max discount</p>
                <Input
                  name="max_discount_value"
                  type="number"
                  value={formik.values.max_discount_value}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Valid from</p>
                <Input
                  name="valid_from"
                  type="datetime-local"
                  value={formik.values.valid_from}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Valid until</p>
                <Input
                  name="valid_until"
                  type="datetime-local"
                  value={formik.values.valid_until}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Usage limits</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    name="usage_limit"
                    type="number"
                    value={formik.values.usage_limit}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Total"
                  />
                  <Input
                    name="user_usage_limit"
                    type="number"
                    value={formik.values.user_usage_limit}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Per user"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">Offer availability metadata (JSON object)</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    formik.setFieldValue(
                      "applicability_text",
                      JSON.stringify(offerAvailabilityTemplate, null, 2)
                    )
                  }
                >
                  Use availability template
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tracked keys: <span className="font-mono">types</span>, <span className="font-mono">categories</span>, <span className="font-mono">city_ids</span>, <span className="font-mono">listing_ids</span>.
              </p>
              <Textarea
                name="applicability_text"
                value={formik.values.applicability_text}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="min-h-[140px] font-mono"
              />
              {formik.touched.applicability_text && formik.errors.applicability_text ? (
                <p className="text-xs text-destructive mt-1">{formik.errors.applicability_text}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="create_offer_active"
                type="checkbox"
                checked={Boolean(formik.values.is_active)}
                onChange={(event) => formik.setFieldValue("is_active", event.target.checked)}
              />
              <label htmlFor="create_offer_active" className="text-sm">
                Offer is active
              </label>
            </div>

            <Button type="submit" disabled={saving || !formik.isValid}>
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
            <AdminEmptyState message="No offers found." />
          ) : null}
          {items.length > 0 ? (
            <>
              <AdminDataTable columns={columns} data={items} />
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

export default AdminOffersPage;
