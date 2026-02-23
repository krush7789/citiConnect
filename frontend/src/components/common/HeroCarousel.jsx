import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const HeroCarousel = ({ slides = [], autoPlayMs = 4000, onCta }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setCurrent(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, autoPlayMs);
    return () => clearInterval(timer);
  }, [slides.length, autoPlayMs]);

  const slide = slides[current];
  const posterUrl = typeof slide?.poster === "string" ? slide.poster.trim() : "";

  const accentOverlay = useMemo(() => {
    const color = slide?.bgColor || "#111827";
    return `radial-gradient(circle at 78% 36%, ${color}70 0%, transparent 48%)`;
  }, [slide?.bgColor]);

  if (!slide) return null;

  return (
    <section className="py-6">
      <div className="relative overflow-hidden rounded-[28px] border min-h-[330px] md:min-h-[420px] bg-card">
        <div className="absolute inset-0">
          {posterUrl ? (
            <img src={posterUrl} alt={slide.title} className="h-full w-full object-cover scale-110 blur-2xl opacity-35" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/85 to-background/38" />
          <div className="absolute inset-0" style={{ background: accentOverlay }} />
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setCurrent((prev) => (prev - 1 + slides.length) % slides.length)}
              className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full border bg-card/95 grid place-content-center hover:bg-card"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setCurrent((prev) => (prev + 1) % slides.length)}
              className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full border bg-card/95 grid place-content-center hover:bg-card"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}

        <div className="relative z-10 grid md:grid-cols-[1fr_360px] gap-6 p-6 md:px-14 md:py-12 min-h-[330px] md:min-h-[420px] items-center">
          <div className="space-y-4 md:pr-6">
            {slide.date ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{slide.date}</p> : null}
            <h2 className="text-3xl md:text-5xl font-black leading-tight">{slide.title}</h2>
            {slide.subtitle ? <p className="text-base md:text-xl text-muted-foreground font-semibold">{slide.subtitle}</p> : null}
            {slide.location ? <p className="text-sm md:text-base text-muted-foreground">{slide.location}</p> : null}
            {slide.price ? <p className="text-sm md:text-base font-semibold text-foreground/90">{slide.price}</p> : null}
            {slide.ctaText ? (
              <Button
                className="mt-2 rounded-2xl px-8"
                onClick={() => {
                  if (onCta) onCta(slide);
                }}
              >
                {slide.ctaText}
              </Button>
            ) : null}
          </div>
          <div className="justify-self-center md:justify-self-end w-[220px] md:w-[330px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-border/60">
            {posterUrl ? (
              <img src={posterUrl} alt={slide.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-muted/70 via-muted/40 to-background" />
            )}
          </div>
        </div>

        {slides.length > 1 ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
            {slides.map((entry, index) => (
              <button
                key={entry.id || index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                className={`h-2 rounded-full transition-all ${index === current ? "w-6 bg-foreground" : "w-2 bg-muted-foreground/45"}`}
                onClick={() => setCurrent(index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default HeroCarousel;
