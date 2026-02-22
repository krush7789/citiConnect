import React from "react";

const ArtistRow = ({ artists = [], title = "Artists in your CitiConnect" }) => {
  return (
    <section className="py-2">
      <h2 className="text-2xl font-bold mb-5">{title}</h2>
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-5 min-w-max pr-8">
          {artists.map((artist) => {
            const imageUrl = typeof artist.image === "string" ? artist.image.trim() : "";
            return (
              <article key={artist.id} className="w-[116px] text-center shrink-0">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={artist.name}
                    className="w-[108px] h-[108px] rounded-full object-cover border-2 border-white shadow mx-auto"
                  />
                ) : (
                  <div className="w-[108px] h-[108px] rounded-full bg-gradient-to-br from-muted/70 via-muted/40 to-background border-2 border-white shadow mx-auto" />
                )}
                <p className="mt-2 text-sm font-semibold line-clamp-1">{artist.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{artist.event}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ArtistRow;
