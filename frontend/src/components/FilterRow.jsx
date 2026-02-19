import React from "react";
import { SlidersHorizontal } from "lucide-react";

const FilterRow = ({ filters = [], activeFilter, onFilterChange, onFiltersClick }) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
      <button
        type="button"
        className="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1"
        onClick={onFiltersClick}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </button>
      {filters.map((filter) => (
        <button
          type="button"
          key={filter}
          className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition ${
            activeFilter === filter ? "bg-foreground text-white border-foreground" : "hover:bg-muted"
          }`}
          onClick={() => onFilterChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
};

export default FilterRow;
