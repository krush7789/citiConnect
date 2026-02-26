import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 8;

const PaginatedCitySelect = ({
  cities = [],
  value = "",
  onChange,
  onBlur,
  disabled = false,
  required = false,
  name,
  id,
  pageSize = DEFAULT_PAGE_SIZE,
  searchPlaceholder = "Search city",
  emptyOptionLabel = "All cities",
  includeEmptyOption = true,
  className,
  inputClassName,
  selectWrapperClassName,
  selectClassName,
  size,
  tone,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const cityOptions = useMemo(
    () =>
      (Array.isArray(cities) ? cities : []).map((city) => {
        const label = String(city?.name || "").trim();
        const state = String(city?.state || "").trim();
        return {
          value: String(city?.id || ""),
          label: label || "--",
          searchText: `${label} ${state}`.toLowerCase(),
        };
      }),
    [cities]
  );

  const filteredOptions = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return cityOptions;
    return cityOptions.filter((option) => option.searchText.includes(query));
  }, [cityOptions, searchQuery]);

  const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);

  const visibleOptions = useMemo(() => {
    const limited = filteredOptions.slice(0, safePageSize);
    if (!value) return limited;
    if (limited.some((option) => option.value === value)) return limited;
    const selectedOption = filteredOptions.find((option) => option.value === value);
    if (!selectedOption) return limited;
    return [
      selectedOption,
      ...limited
        .filter((option) => option.value !== selectedOption.value)
        .slice(0, safePageSize - 1),
    ];
  }, [filteredOptions, safePageSize, value]);

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={searchPlaceholder}
        disabled={disabled}
        className={inputClassName}
      />
      <Select
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          if (onChange) onChange(event.target.value, event);
        }}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        size={size}
        tone={tone}
        wrapperClassName={selectWrapperClassName}
        className={selectClassName}
      >
        {includeEmptyOption ? <option value="">{emptyOptionLabel}</option> : null}
        {visibleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
};

export default PaginatedCitySelect;
