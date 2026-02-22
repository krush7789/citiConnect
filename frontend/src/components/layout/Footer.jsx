import React from "react";

const Footer = () => {
  return (
    <footer className="mt-20 bg-zinc-900 text-zinc-100">
      <div className="container mx-auto px-4 md:px-8 py-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <p className="text-3xl font-black tracking-tight">CitiConnect</p>
            <p className="text-sm text-zinc-400 mt-2 max-w-sm">
              Book events, movies, activities and dining. Manage bookings and wishlist in one place.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
