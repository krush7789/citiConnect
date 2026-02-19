import React from "react";

const ArtistRow = ({ artists = [], title = "Artists in your CitiConnect" }) => {
  return (
    <section className="py-2">
      <h2 className="text-2xl font-bold mb-5">{title}</h2>
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-5 min-w-max pr-8">
          {artists.map((artist) => (
            <article key={artist.id} className="w-[116px] text-center shrink-0">
              <img
                src={artist.image}
                alt={artist.name}
                className="w-[108px] h-[108px] rounded-full object-cover border-2 border-white shadow mx-auto"
              />
              <p className="mt-2 text-sm font-semibold line-clamp-1">{artist.name}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">{artist.event}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ArtistRow;
