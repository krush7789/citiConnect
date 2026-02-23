import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HorizontalCardCarousel = ({
  items = [],
  renderItem,
  className,
  itemClassName = "w-[84%] sm:w-[47%] lg:w-[31%] xl:w-[24%]",
}) => {
  const railRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const syncScrollState = useCallback(() => {
    const node = railRef.current;
    if (!node) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth - 2);
    setCanScrollPrev(node.scrollLeft > 2);
    setCanScrollNext(node.scrollLeft < maxScrollLeft);
  }, []);

  useEffect(() => {
    syncScrollState();
    const node = railRef.current;
    if (!node) return;
    const onScroll = () => syncScrollState();
    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncScrollState);
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncScrollState);
    };
  }, [items.length, syncScrollState]);

  const scrollByAmount = (direction) => {
    const node = railRef.current;
    if (!node) return;
    const amount = Math.max(320, Math.floor(node.clientWidth * 0.88));
    node.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      {items.length > 1 ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollByAmount(-1)}
            disabled={!canScrollPrev}
            className="hidden md:inline-flex absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-card/95"
            aria-label="Scroll previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollByAmount(1)}
            disabled={!canScrollNext}
            className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-card/95"
            aria-label="Scroll next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      ) : null}

      <div ref={railRef} className="flex gap-5 overflow-x-auto no-scrollbar scroll-smooth pr-4">
        {items.map((item, index) => (
          <div key={item.id || index} className={cn("shrink-0", itemClassName)}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalCardCarousel;
