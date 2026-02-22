import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const normalizeSort = (sortOptions, selectedSort) => {
  if (selectedSort && sortOptions.some((option) => option.value === selectedSort)) {
    return selectedSort;
  }
  return sortOptions[0]?.value || "";
};

const SortFilterModal = ({
  open,
  onOpenChange,
  title = "Filter by",
  sortOptions = [],
  selectedSort = "",
  categoryOptions = [],
  selectedCategory = "All",
  onApply,
}) => {
  const [activeTab, setActiveTab] = useState("sort");
  const [draftSort, setDraftSort] = useState(normalizeSort(sortOptions, selectedSort));
  const [draftCategory, setDraftCategory] = useState(selectedCategory || "All");

  const hasCategories = categoryOptions.length > 0;
  const tabs = useMemo(
    () => [
      { id: "sort", label: "Sort By" },
      ...(hasCategories ? [{ id: "category", label: "Category" }] : []),
    ],
    [hasCategories]
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("sort");
    setDraftSort(normalizeSort(sortOptions, selectedSort));
    setDraftCategory(selectedCategory || "All");
  }, [open, selectedSort, selectedCategory, sortOptions]);

  const onClear = () => {
    setDraftSort(sortOptions[0]?.value || "");
    setDraftCategory("All");
  };

  const onSubmit = () => {
    onApply?.({
      sort: draftSort || sortOptions[0]?.value || "",
      category: draftCategory || "All",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-3xl rounded-3xl border p-0 overflow-hidden">
        <div className="px-8 pt-7 pb-4">
          <DialogTitle className="text-[30px] font-semibold tracking-tight">{title}</DialogTitle>
        </div>

        <div className="px-8 pb-7">
          <div className="grid grid-cols-[180px_1fr] min-h-[360px] rounded-2xl border overflow-hidden bg-muted/20">
            <div className="border-r bg-muted/35 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeTab === tab.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:bg-background/70"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6 bg-background">
              {activeTab === "sort" ? (
                <div className="space-y-4">
                  {sortOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-3 text-lg cursor-pointer">
                      <input
                        type="radio"
                        name="sort_by"
                        value={option.value}
                        checked={draftSort === option.value}
                        onChange={(event) => setDraftSort(event.target.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {activeTab === "category" ? (
                <div className="space-y-3">
                  {categoryOptions.map((category) => (
                    <label key={category} className="flex items-center gap-3 text-base cursor-pointer">
                      <input
                        type="radio"
                        name="category"
                        value={category}
                        checked={draftCategory === category}
                        onChange={(event) => setDraftCategory(event.target.value)}
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <button type="button" onClick={onClear} className="text-base underline underline-offset-4 hover:text-primary">
              Clear filters
            </button>
            <Button type="button" className="h-12 min-w-56 rounded-xl text-base" onClick={onSubmit}>
              Apply Filters
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SortFilterModal;
