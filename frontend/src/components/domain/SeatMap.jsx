import React, { useMemo } from "react";

const stateClassMap = {
  AVAILABLE: "bg-white border-emerald-500 text-emerald-700 hover:bg-emerald-50",
  HELD: "bg-amber-300 border-amber-400 text-amber-900 cursor-not-allowed",
  LOCKED: "bg-amber-300 border-amber-400 text-amber-900 cursor-not-allowed",
  BOOKED: "bg-zinc-200 border-zinc-300 text-zinc-500 cursor-not-allowed",
};

const SeatMap = ({ seatMap, selectedSeats, onToggleSeat }) => {
  const seatStatesById = useMemo(() => {
    if (!seatMap) return {};
    return Object.fromEntries((seatMap.seat_states || []).map((state) => [state.seat_id, state]));
  }, [seatMap]);

  const selectedSet = useMemo(() => new Set(selectedSeats || []), [selectedSeats]);

  const aislesAfter = useMemo(() => {
    if (!seatMap?.seat_layout?.aisles_after) return [];
    return Array.isArray(seatMap.seat_layout.aisles_after)
      ? seatMap.seat_layout.aisles_after.map((value) => Number(value)).filter((value) => Number.isInteger(value))
      : [];
  }, [seatMap]);

  const gridContent = useMemo(() => {
    if (!seatMap?.seat_layout?.rows) return null;
    return seatMap.seat_layout.rows.map((row) => (
      <div key={row} className="flex items-center gap-3 justify-center">
        <span className="w-5 text-xs text-muted-foreground">{row}</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: seatMap.seat_layout.columns }).map((_, index) => {
            const seatId = `${row}${index + 1}`;
            const seatState = seatStatesById[seatId] || { state: "BOOKED" };
            const isSelected = selectedSet.has(seatId);
            const isDisabled = seatState.state !== "AVAILABLE";
            const needsAisleGap = aislesAfter.includes(index);
            return (
              <div key={seatId} className={needsAisleGap ? "mr-3" : ""}>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onToggleSeat(seatId, seatState)}
                  className={`h-7 w-7 rounded text-[10px] border transition ${isSelected
                    ? "bg-primary border-primary text-white"
                    : stateClassMap[seatState.state] || "bg-zinc-100 border-zinc-200"
                    }`}
                >
                  {index + 1}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    ));
  }, [seatMap, seatStatesById, selectedSet, aislesAfter, onToggleSeat]);

  return (
    <div className="overflow-x-auto pb-8">
      <div className="min-w-[620px]">
        <div className="mb-10 text-center">
          <div className="mx-auto w-2/3 h-2 bg-muted rounded-full relative">
            <span className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">SCREEN THIS WAY</span>
          </div>
        </div>

        <div className="space-y-2">{gridContent}</div>

        <div className="mt-8 pt-4 border-t flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-emerald-500 bg-white" />
            Available
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-primary bg-primary" />
            Selected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-amber-400 bg-amber-300" />
            Held
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-zinc-300 bg-zinc-200" />
            Booked
          </span>
        </div>
      </div>
    </div>
  );
};

export default SeatMap;
