import React, { useEffect, useState } from "react";
import { adminService } from "@/api/services";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const AdminAuditLogsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    action: "",
    entity_type: "",
    search: "",
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    adminService
      .getAuditLogs({
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        page: 1,
        page_size: 300,
      })
      .then((response) => {
        if (!mounted) return;
        setItems(response.items || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.normalized?.message || "Failed to load audit logs.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [filters.action, filters.entity_type]);

  const filteredItems = items.filter((log) => {
    if (!filters.search) return true;
    const query = filters.search.toLowerCase();
    const diffText = JSON.stringify(log.diff || {}).toLowerCase();
    return (
      String(log.action || "").toLowerCase().includes(query) ||
      String(log.entity_type || "").toLowerCase().includes(query) ||
      String(log.entity_id || "").toLowerCase().includes(query) ||
      String(log.admin_user || "").toLowerCase().includes(query) ||
      diffText.includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track admin actions with entity-level diff previews.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Action</p>
              <Input
                value={filters.action}
                onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value.toUpperCase() }))}
                placeholder="CREATE_LISTING"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entity type</p>
              <Input
                value={filters.entity_type}
                onChange={(event) => setFilters((prev) => ({ ...prev, entity_type: event.target.value.toUpperCase() }))}
                placeholder="LISTING / OFFER / OCCURRENCE"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Search</p>
              <Input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Find in logs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading audit logs...</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Log timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !filteredItems.length ? (
            <div className="rounded-lg border p-5 text-sm text-muted-foreground">No audit logs found.</div>
          ) : null}
          {filteredItems.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Time</th>
                    <th className="text-left p-3">Admin</th>
                    <th className="text-left p-3">Action</th>
                    <th className="text-left p-3">Entity</th>
                    <th className="text-left p-3">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((log) => (
                    <tr key={log.id} className="border-t align-top">
                      <td className="p-3">{formatDateTime(log.created_at)}</td>
                      <td className="p-3">{log.admin_user || "--"}</td>
                      <td className="p-3">{log.action || "--"}</td>
                      <td className="p-3">
                        <p>{log.entity_type || "--"}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{log.entity_id || "--"}</p>
                      </td>
                      <td className="p-3">
                        <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-auto max-h-28">
                          {JSON.stringify(log.diff || {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLogsPage;
