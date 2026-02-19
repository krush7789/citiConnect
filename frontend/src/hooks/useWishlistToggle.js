import { useAuth } from "@/context/AuthContext";
import { wishlistService } from "@/api/services";

const useWishlistToggle = (setItems) => {
  const { requireAuth } = useAuth();

  const toggleWishlist = async (listing) => {
    if (!requireAuth({ type: "navigate", path: "/wishlist" })) return;
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
  };

  return toggleWishlist;
};

export default useWishlistToggle;
