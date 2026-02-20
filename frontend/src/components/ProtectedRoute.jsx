import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const buildCurrentPath = (location) => `${location.pathname}${location.search}${location.hash}`;

const ProtectedRoute = ({ children, roles = null, fallbackPath = "/" }) => {
  const location = useLocation();
  const { isAuthenticated, user, requireAuth } = useAuth();
  const currentPath = buildCurrentPath(location);

  useEffect(() => {
    if (isAuthenticated) return;
    requireAuth({ type: "navigate", path: currentPath });
  }, [isAuthenticated, requireAuth, currentPath]);

  if (!isAuthenticated) {
    return <Navigate to={fallbackPath} replace />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
};

export default ProtectedRoute;
