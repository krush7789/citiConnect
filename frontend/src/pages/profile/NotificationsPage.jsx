import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { notificationService } from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import { formatDateTime } from "@/lib/format";

const types = ["ALL", "BOOKING", "OFFER", "SYSTEM"];

const NotificationsPage = () => {
  const { requireAuth, isAuthenticated } = useAuth();
  const [activeType, setActiveType] = useState("ALL");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const response = await notificationService.getNotifications({
      page: 1,
      page_size: 50,
      type: activeType === "ALL" ? undefined : activeType,
    });
    setItems(response.items || []);
    setLoading(false);
  }, [activeType]);

  useEffect(() => {
    if (!requireAuth({ type: "navigate", path: "/notifications" })) {
      setLoading(false);
      return;
    }
    loadNotifications();
  }, [isAuthenticated, activeType, requireAuth, loadNotifications]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-10">
        <p className="text-sm text-muted-foreground">Login to view your notifications.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 pb-16">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={async () => {
            await notificationService.markAllRead();
            loadNotifications();
          }}
        >
          Mark all as read
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className={`px-3 py-1.5 rounded-full border text-xs ${activeType === type ? "bg-foreground text-white" : ""}`}
            onClick={() => setActiveType(type)}
          >
            {type}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading notifications...</p> : null}
      {!loading && items.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">No notifications available.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border p-4 transition ${item.is_read ? "bg-card" : "bg-primary/5 border-primary/30"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted grid place-content-center">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{item.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">{formatDateTime(item.created_at, "Asia/Kolkata")}</p>
                  </div>
                </div>
                {!item.is_read ? (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={async () => {
                      await notificationService.markOneRead(item.id);
                      setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, is_read: true } : entry)));
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
