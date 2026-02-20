import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listingService } from "@/api/services";
import { LISTING_TYPE, OCCURRENCE_STATUS } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";

const MovieShowtimesPage = () => {
  const navigate = useNavigate();
  const { listingId } = useParams();

  const [listing, setListing] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listingService
      .getListingById(listingId)
      .then((response) => {
        if (!mounted) return;
        if (response.listing?.type !== LISTING_TYPE.MOVIE) {
          navigate(`/listings/${listingId}`, { replace: true });
          return;
        }

        const now = Date.now();
        const upcoming = (response.occurrences || []).filter((occurrence) => {
          if (occurrence.status !== OCCURRENCE_STATUS.SCHEDULED) return false;
          const reference = new Date(occurrence.end_time || occurrence.start_time).getTime();
          return !Number.isNaN(reference) && reference >= now;
        });

        setListing(response.listing);
        setOccurrences(upcoming);
        if (upcoming[0]) setSelectedOccurrenceId(upcoming[0].id);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.normalized?.message || "Unable to load movie showtimes.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [listingId, navigate]);

  const selectedOccurrence = useMemo(
    () => occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) || null,
    [occurrences, selectedOccurrenceId]
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Loading showtimes...</p>
      </div>
    );
  }

  if (!listing || error) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-destructive">{error || "Unable to load showtimes."}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/listings/${listingId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Book tickets</h1>
          <p className="text-sm text-muted-foreground">{listing.title}</p>
        </div>
      </div>

      <section className="mt-6 space-y-3">
        {occurrences.length === 0 ? (
          <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">
            No upcoming showtimes available for this movie.
          </div>
        ) : (
          occurrences.map((occurrence) => {
            const active = occurrence.id === selectedOccurrenceId;
            return (
              <button
                type="button"
                key={occurrence.id}
                onClick={() => setSelectedOccurrenceId(occurrence.id)}
                className={`w-full text-left rounded-xl border bg-white p-4 transition ${
                  active ? "border-primary bg-primary/5" : "hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatDateTime(occurrence.start_time, listing.timezone)}</p>
                    <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {occurrence.venue_name || listing.venue?.name || listing.address}
                    </p>
                    {occurrence.provider_sub_location ? (
                      <p className="text-xs text-muted-foreground mt-1">{occurrence.provider_sub_location}</p>
                    ) : null}
                  </div>
                  <span className="text-xs border rounded-full px-2 py-1">
                    {occurrence.capacity_remaining} seats left
                  </span>
                </div>
              </button>
            );
          })
        )}
      </section>

      <div className="fixed bottom-0 inset-x-0 border-t bg-white px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Selected showtime</p>
            <p className="text-sm font-medium">
              {selectedOccurrence ? formatDateTime(selectedOccurrence.start_time, listing.timezone) : "None"}
            </p>
          </div>
          <Button
            disabled={!selectedOccurrence}
            onClick={() => navigate(`/listings/${listingId}/occurrences/${selectedOccurrence.id}/seats`)}
            className="min-w-[190px]"
          >
            Select seats
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MovieShowtimesPage;
