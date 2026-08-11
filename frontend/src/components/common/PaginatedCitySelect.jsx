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
  searchValue,
  onSearchChange,
  disableLocalFilter = false,
  showAllWhenSearching = false,
}) => {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = searchValue !== undefined ? searchValue : internalSearchQuery;

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
    if (disableLocalFilter) return cityOptions;
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return cityOptions;
    return cityOptions.filter((option) => option.searchText.includes(query));
  }, [cityOptions, searchQuery, disableLocalFilter]);

  const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);

  const visibleOptions = useMemo(() => {
    const shouldLimit =
      !showAllWhenSearching || !String(searchQuery || "").trim();
    const limited = shouldLimit
      ? filteredOptions.slice(0, safePageSize)
      : filteredOptions;
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
  }, [filteredOptions, safePageSize, searchQuery, showAllWhenSearching, value]);

  const onSearchInputChange = (event) => {
    const nextValue = event.target.value;
    if (searchValue === undefined) {
      setInternalSearchQuery(nextValue);
    }
    if (onSearchChange) {
      onSearchChange(nextValue, event);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        value={searchQuery}
        onChange={onSearchInputChange}
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
