import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ANALYTICS_INTERVAL_OPTIONS,
  ANALYTICS_LISTING_TYPE_OPTIONS,
  ANALYTICS_PRESET_OPTIONS,
  ANALYTICS_SOURCE_DIMENSION_OPTIONS,
} from "./analyticsFilters";

const AdminAnalyticsFilterBar = ({
  filters,
  cities = [],
  onFilterChange,
  includeInterval = true,
  includeSourceDimension = true,
  includeTopN = true,
  includeCity = true,
  includeListingType = true,
}) => {
  const isCustom = filters.preset === "custom";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Preset</p>
            <Select
              value={filters.preset}
              onChange={(event) => onFilterChange("preset", event.target.value)}
            >
              {ANALYTICS_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Date from</p>
            <Input
              type="date"
              value={filters.date_from || ""}
              onChange={(event) => onFilterChange("date_from", event.target.value)}
              disabled={!isCustom}
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Date to</p>
            <Input
              type="date"
              value={filters.date_to || ""}
              onChange={(event) => onFilterChange("date_to", event.target.value)}
              disabled={!isCustom}
            />
          </div>

          {includeCity ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">City</p>
              <Select
                value={filters.city_id || ""}
                onChange={(event) => onFilterChange("city_id", event.target.value)}
              >
                <option value="">All cities</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {includeListingType ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Listing type</p>
              <Select
                value={filters.listing_type || ""}
                onChange={(event) => onFilterChange("listing_type", event.target.value)}
              >
                {ANALYTICS_LISTING_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {includeInterval ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Interval</p>
              <Select
                value={filters.interval || ""}
                onChange={(event) => onFilterChange("interval", event.target.value)}
              >
                {ANALYTICS_INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {includeSourceDimension ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Revenue source by</p>
              <Select
                value={filters.source_dimension || "category"}
                onChange={(event) =>
                  onFilterChange("source_dimension", event.target.value)
                }
              >
                {ANALYTICS_SOURCE_DIMENSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {includeTopN ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Show top categories</p>
              <Input
                type="number"
                min={1}
                max={25}
                value={filters.top_n}
                onChange={(event) => onFilterChange("top_n", event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminAnalyticsFilterBar;
