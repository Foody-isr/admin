'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, getStoredUser, getStoredRestaurantIds, isAuthenticated, logout as apiLogout } from '@/lib/api';

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
    if (isAuthenticated()) {
      const stored = getStoredUser();
      const rids = getStoredRestaurantIds();
      if (stored && (stored.role === 'owner' || stored.role === 'manager')) {
        setUserState(stored);
        setRestaurantIds(rids);
      }
    }
    setLoading(false);
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
