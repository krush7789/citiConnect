import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EventCard from "@/components/EventCard";
import { wishlistService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";

const WishlistPage = () => {
  const navigate = useNavigate();
  const { requireAuth, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: "/wishlist" })) {
      setLoading(false);
      return;
    }

    let mounted = true;
    wishlistService
      .getWishlist({ page: 1, page_size: 50 })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, requireAuth]);

  const onToggleWishlist = async (listing) => {
    const nextState = !listing.is_wishlisted;
    setItems((prev) =>
      prev.map((item) => (item.id === listing.id ? { ...item, is_wishlisted: nextState } : item))
    );

    try {
      if (nextState) await wishlistService.addWishlist(listing.id);
      else await wishlistService.removeWishlist(listing.id);
    } catch {
      setItems((prev) =>
        prev.map((item) => (item.id === listing.id ? { ...item, is_wishlisted: !nextState } : item))
      );
    }

    if (!nextState) {
      setItems((prev) => prev.filter((item) => item.id !== listing.id));
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view your wishlist.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Wishlist</h1>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/search")}>
          Discover more
        </button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading wishlist...</p> : null}
      {!loading && items.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">No saved listings yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {items.map((item) => (
            <EventCard key={item.id} listing={item} onToggleWishlist={onToggleWishlist} />
          ))}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
