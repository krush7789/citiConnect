import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const buildPath = (location) => `${location.pathname}${location.search}${location.hash}`;

const AuthIntentHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, pendingIntent, setPendingIntent } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !pendingIntent) return;

    if (pendingIntent.type !== "navigate" || !pendingIntent.path) {
      setPendingIntent(null);
      return;
    }

    const currentPath = buildPath(location);
    const targetPath = pendingIntent.path;
    setPendingIntent(null);

    if (targetPath !== currentPath) {
      navigate(targetPath, { replace: true });
    }
  }, [isAuthenticated, pendingIntent, setPendingIntent, location, navigate]);

  return null;
};

export default AuthIntentHandler;
