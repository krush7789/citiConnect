import React, { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const buildCurrentPath = (location) => `${location.pathname}${location.search}${location.hash}`;
const normalizeRoles = (roles) => {
  if (Array.isArray(roles)) return roles;
  if (typeof roles === "string" && roles.trim()) return [roles];
  return [];
};

const ProtectedRoute = ({
  children,
  roles = null,
  fallbackPath = "/",
  forbiddenPath = "/forbidden",
  rememberIntent = true,
}) => {
  const location = useLocation();
  const { isAuthenticated, user, requireAuth } = useAuth();
  const currentPath = buildCurrentPath(location);
  const requiredRoles = normalizeRoles(roles);
  const lastIntentPathRef = useRef("");

  useEffect(() => {
    if (!rememberIntent || isAuthenticated) {
      lastIntentPathRef.current = "";
      return;
    }
    if (lastIntentPathRef.current === currentPath) return;
    lastIntentPathRef.current = currentPath;
    requireAuth({ type: "navigate", path: currentPath });
  }, [isAuthenticated, requireAuth, currentPath, rememberIntent]);

  if (!isAuthenticated) {
    return <Navigate to={fallbackPath} replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user?.role)) {
    return <Navigate to={forbiddenPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
