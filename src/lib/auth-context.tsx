'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  User,
  getStoredUser,
  getStoredRestaurantIds,
  isAuthenticated,
  canAccessAdmin,
  logout as apiLogout,
  refreshToken,
  tokenTimeToExpiryMs,
} from '@/lib/api';

// Refresh the JWT when it has this little life left (or is already expired but
// still inside the server's 7-day grace window), so authenticated pages never
// hit a 401 on load and the session keeps rolling forward with normal use.
const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

function shouldRefresh(): boolean {
  const ttl = tokenTimeToExpiryMs();
  return ttl !== null && ttl < REFRESH_THRESHOLD_MS;
}

interface AuthContextType {
  user: User | null;
  restaurantIds: number[];
  isLoggedIn: boolean;
  loading: boolean;
  logout: () => void;
  setUser: (user: User, restaurantIds: number[]) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  restaurantIds: [],
  isLoggedIn: false,
  loading: true,
  logout: () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [restaurantIds, setRestaurantIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAuthenticated()) {
        // Roll the session forward before pages fire their first authenticated
        // request. If refresh fails, the token is beyond the grace window
        // (or revoked) — drop to logged-out so the guard sends us to /login.
        if (shouldRefresh() && !(await refreshToken())) {
          apiLogout();
          if (!cancelled) setLoading(false);
          return;
        }
        const stored = getStoredUser();
        const rids = getStoredRestaurantIds();
        if (canAccessAdmin(stored, rids)) {
          if (!cancelled) {
            setUserState(stored);
            setRestaurantIds(rids);
          }
        } else {
          // Token exists but user data is missing/invalid — clear stale auth
          // to prevent redirect loops between login and dashboard
          apiLogout();
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // iOS PWAs resume a suspended app without remounting, so top up the token
  // when the app returns to the foreground and it's close to expiry.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isAuthenticated() && shouldRefresh()) {
        void refreshToken();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUserState(null);
    setRestaurantIds([]);
    window.location.href = '/login';
  }, []);

  const setUser = useCallback((u: User, rids: number[]) => {
    setUserState(u);
    setRestaurantIds(rids);
  }, []);

  return (
    <AuthContext.Provider value={{ user, restaurantIds, isLoggedIn: !!user, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
