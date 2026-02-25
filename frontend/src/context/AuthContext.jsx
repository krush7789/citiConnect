import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import LoginModal from "@/components/auth/LoginModal";
import RegisterModal from "@/components/auth/RegisterModal";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import ChangePasswordModal from "@/components/auth/ChangePasswordModal";
import { authService } from "@/api/services";
import { clearStoredAuth, setStoredToken, setUnauthorizedHandler, USER_STORAGE_KEY } from "@/api/client";
import { normalizeUser } from "@/lib/contracts";

const isPersistedUser = (value) =>
  Boolean(
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.trim() &&
    typeof value.email === "string" &&
    value.email.includes("@")
  );

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPersistedUser(parsed)) return null;
    return normalizeUser(parsed);
  } catch {
    return null;
  }
};

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

const modalRenderMap = {
  login: LoginModal,
  register: RegisterModal,
  forgot_password: ForgotPasswordModal,
  change_password: ChangePasswordModal,
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);
  const [authModalState, setAuthModalState] = useState({ open: false, view: "login" });
  const [pendingIntent, setPendingIntent] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const isAuthenticated = Boolean(user);
  const authState = user ? "authenticated" : "anonymous";

  const persistAuth = useCallback((authPayload) => {
    const token = typeof authPayload?.access_token === "string" ? authPayload.access_token.trim() : "";
    const rawUser = authPayload?.user;
    if (!token || !isPersistedUser(rawUser)) {
      throw new Error("Invalid auth response");
    }
    const normalizedUser = normalizeUser(rawUser);
    setStoredToken(token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    return normalizedUser;
  }, []);

  const openAuthModal = useCallback((view = "login", intent = null) => {
    if (intent) setPendingIntent(intent);
    setAuthModalState({ open: true, view });
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalState((prev) => ({ ...prev, open: false })), []);
  const switchAuthModal = useCallback((view) => setAuthModalState({ open: true, view }), []);

  const requireAuth = useCallback((intent) => {
    if (isAuthenticated) return true;
    openAuthModal("login", intent || null);
    return false;
  }, [isAuthenticated, openAuthModal]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearStoredAuth();
      setUser(null);
      setPendingIntent(null);
      closeAuthModal();
    }
  }, [closeAuthModal]);

  const login = useCallback(async (payload) => {
    setAuthLoading(true);
    try {
      const response = await authService.login(payload);
      const nextUser = persistAuth(response);
      closeAuthModal();
      return nextUser;
    } finally {
      setAuthLoading(false);
    }
  }, [persistAuth, closeAuthModal]);

  const register = useCallback(async (payload) => {
    setAuthLoading(true);
    try {
      const response = await authService.register(payload);
      const nextUser = persistAuth(response);
      closeAuthModal();
      return nextUser;
    } finally {
      setAuthLoading(false);
    }
  }, [persistAuth, closeAuthModal]);

  const forgotPassword = useCallback(async (payload) => {
    setAuthLoading(true);
    try {
      const response = await authService.forgotPassword(payload);
      switchAuthModal("login");
      return response;
    } finally {
      setAuthLoading(false);
    }
  }, [switchAuthModal]);

  const changePassword = useCallback(async (payload) => {
    setAuthLoading(true);
    try {
      const response = await authService.changePassword(payload);
      closeAuthModal();
      return response;
    } finally {
      setAuthLoading(false);
    }
  }, [closeAuthModal]);

  const handleUnauthorized = useCallback(() => {
    setUser(null);
    clearStoredAuth();
    openAuthModal("login");
  }, [openAuthModal]);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  const contextValue = useMemo(
    () => ({
      user,
      isAuthenticated,
      authState,
      authLoading,
      authModalState,
      pendingIntent,
      setPendingIntent,
      openAuthModal,
      closeAuthModal,
      switchAuthModal,
      requireAuth,
      login,
      register,
      forgotPassword,
      changePassword,
      logout,
    }),
    [
      user,
      isAuthenticated,
      authState,
      authLoading,
      authModalState,
      pendingIntent,
      openAuthModal,
      closeAuthModal,
      switchAuthModal,
      requireAuth,
      login,
      register,
      forgotPassword,
      changePassword,
      logout,
    ]
  );

  const ActiveModal = modalRenderMap[authModalState.view];

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <Dialog open={authModalState.open} onOpenChange={(open) => !open && closeAuthModal()}>
        <DialogContent className="p-0 sm:max-w-[430px]">
          <VisuallyHidden><DialogTitle>Authentication</DialogTitle></VisuallyHidden>
          {ActiveModal ? <ActiveModal /> : null}
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
};
