import React from "react";
import { Button } from "@/components/ui/button";

const PaginationControls = ({
  page = 1,
  totalPages = 1,
  totalItems = 0,
  onPrevious,
  onNext,
  className = "",
  disabled = false,
}) => {
  const safePage = Number.isFinite(Number(page)) ? Number(page) : 1;
  const safeTotalPages = Math.max(1, Number.isFinite(Number(totalPages)) ? Number(totalPages) : 1);
  const safeTotalItems = Math.max(0, Number.isFinite(Number(totalItems)) ? Number(totalItems) : 0);

  return (
    <div className={`mt-5 flex items-center justify-between gap-3 ${className}`}>
      <p className="text-sm text-muted-foreground">
        Page {safePage} of {safeTotalPages} - {safeTotalItems} results
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={disabled || safePage <= 1}>
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={disabled || safePage >= safeTotalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default PaginationControls;
