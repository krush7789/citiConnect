import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReadOnlyField } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

// AdminListingForm extracted from AdminListingsPage to reduce file bloat
const AdminListingForm = ({
    formMode,
    listingFormik,
    listingTypes,
    listingStatuses,
    cities,
    venues,
    selectedCity,
    saving,
    uploadingCover,
    uploadingGallery,
    galleryUrls,
    trimmedOrUndefined,
    onUploadCover,
    onUploadGallery,
    useTypeTemplate,
    onCancelForm
}) => {
    if (!formMode) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">
                    {formMode === "create"
                        ? "Create listing"
                        : `Edit listing: ${listingFormik.values.title || listingFormik.values.id}`}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={listingFormik.handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Type <span className="text-destructive">*</span></p>
                            <Select
                                name="type"
                                value={listingFormik.values.type}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            >
                                {listingTypes.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </Select>
                            {listingFormik.touched.type && listingFormik.errors.type ? (
                                <p className="text-xs text-destructive mt-1">{listingFormik.errors.type}</p>
                            ) : null}
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">City (optional)</p>
                            <Select
                                name="city_id"
                                value={listingFormik.values.city_id}
                                onChange={(event) => {
                                    listingFormik.setFieldValue("city_id", event.target.value);
                                    listingFormik.setFieldValue("venue_id", "");
                                }}
                                onBlur={listingFormik.handleBlur}
                            >
                                <option value="">Nationwide / All India</option>
                                {cities.map((city) => (
                                    <option key={city.id} value={city.id}>
                                        {city.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Venue (optional)</p>
                            <Select
                                name="venue_id"
                                value={listingFormik.values.venue_id}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            >
                                <option value="">Auto / Multiple venues</option>
                                {venues.map((venue) => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Title <span className="text-destructive">*</span></p>
                            <Input
                                name="title"
                                value={listingFormik.values.title}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            />
                            {listingFormik.touched.title && listingFormik.errors.title ? (
                                <p className="text-xs text-destructive mt-1">{listingFormik.errors.title}</p>
                            ) : null}
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Category</p>
                            <Input
                                name="category"
                                value={listingFormik.values.category}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Description</p>
                        <Textarea
                            name="description"
                            value={listingFormik.values.description}
                            onChange={listingFormik.handleChange}
                            onBlur={listingFormik.handleBlur}
                            className="min-h-[88px]"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Price min</p>
                            <Input
                                name="price_min"
                                type="number"
                                value={listingFormik.values.price_min}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Price max</p>
                            <Input
                                name="price_max"
                                type="number"
                                value={listingFormik.values.price_max}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Status <span className="text-destructive">*</span></p>
                            <Select
                                name="status"
                                value={listingFormik.values.status}
                                onChange={listingFormik.handleChange}
                                onBlur={listingFormik.handleBlur}
                            >
                                {listingStatuses.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </Select>
                            {listingFormik.touched.status && listingFormik.errors.status ? (
                                <p className="text-xs text-destructive mt-1">{listingFormik.errors.status}</p>
                            ) : null}
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">City preview</p>
                            <ReadOnlyField>
                                {selectedCity ? selectedCity.name : "All India / Multiple venues"}
                            </ReadOnlyField>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            id="is_featured"
                            type="checkbox"
                            checked={Boolean(listingFormik.values.is_featured)}
                            onChange={(event) => listingFormik.setFieldValue("is_featured", event.target.checked)}
                        />
                        <label htmlFor="is_featured" className="text-sm">
                            Featured listing
                        </label>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Offer text</p>
                        <Input
                            name="offer_text"
                            value={listingFormik.values.offer_text}
                            onChange={listingFormik.handleChange}
                            onBlur={listingFormik.handleBlur}
                        />
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Upload cover image</p>
                        <Input type="file" accept="image/*" onChange={onUploadCover} disabled={uploadingCover} />
                        {uploadingCover ? <p className="text-xs text-muted-foreground mt-1">Uploading cover...</p> : null}
                    </div>

                    {(trimmedOrUndefined(listingFormik.values.cover_image_url) || galleryUrls[0]) ? (
                        <img
                            src={trimmedOrUndefined(listingFormik.values.cover_image_url) || galleryUrls[0]}
                            alt="Cover preview"
                            className="h-40 w-full max-w-md rounded-md border object-cover"
                        />
                    ) : null}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-xs text-muted-foreground">Gallery image URLs (comma or newline separated)</p>
                            <Input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={onUploadGallery}
                                disabled={uploadingGallery}
                                className="max-w-sm"
                            />
                        </div>
                        {uploadingGallery ? <p className="text-xs text-muted-foreground">Uploading gallery...</p> : null}
                        <Textarea
                            name="gallery_urls_text"
                            value={listingFormik.values.gallery_urls_text}
                            onChange={listingFormik.handleChange}
                            onBlur={listingFormik.handleBlur}
                            className="min-h-[88px]"
                            placeholder="https://.../img1.jpg&#10;https://.../img2.jpg"
                        />
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Vibe tags (comma separated)</p>
                        <Input
                            name="vibe_tags_text"
                            value={listingFormik.values.vibe_tags_text}
                            onChange={listingFormik.handleChange}
                            onBlur={listingFormik.handleBlur}
                            placeholder="family, date-night, premium"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground">Type metadata (JSON object) <span className="text-destructive">*</span></p>
                            <Button type="button" size="sm" variant="outline" onClick={useTypeTemplate}>
                                Use {listingFormik.values.type} template
                            </Button>
                        </div>
                        {listingFormik.values.type === "EVENT" ? (
                            <p className="text-[11px] text-muted-foreground">
                                Event user limit field: <span className="font-mono">booking.per_user_ticket_limit</span> (set a positive integer, or keep <span className="font-mono">null</span> for no limit).
                            </p>
                        ) : null}
                        <Textarea
                            name="metadata_text"
                            value={listingFormik.values.metadata_text}
                            onChange={listingFormik.handleChange}
                            onBlur={listingFormik.handleBlur}
                            className="min-h-[170px] font-mono"
                        />
                        {listingFormik.touched.metadata_text && listingFormik.errors.metadata_text ? (
                            <p className="text-xs text-destructive mt-1">{listingFormik.errors.metadata_text}</p>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button type="submit" disabled={saving || !listingFormik.isValid}>
                            {saving ? "Saving..." : formMode === "create" ? "Create listing" : "Save changes"}
                        </Button>
                        <Button type="button" variant="outline" onClick={onCancelForm}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default AdminListingForm;
