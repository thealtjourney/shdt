import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'viewer';
  organisation_id: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  setTokens: (access: string, refresh: string, user: UserInfo) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const STORAGE_KEY_ACCESS = 'shdt_access_token';
const STORAGE_KEY_REFRESH = 'shdt_refresh_token';
const STORAGE_KEY_USER = 'shdt_user';
const TOKEN_REFRESH_INTERVAL = 25 * 60 * 1000; // 25 minutes (before 30 min expiry)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedAccessToken = localStorage.getItem(STORAGE_KEY_ACCESS);
    const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH);
    const storedUser = localStorage.getItem(STORAGE_KEY_USER);

    if (storedAccessToken && storedRefreshToken && storedUser) {
      try {
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Failed to restore auth state:', err);
        // Clear invalid stored data
        localStorage.removeItem(STORAGE_KEY_ACCESS);
        localStorage.removeItem(STORAGE_KEY_REFRESH);
        localStorage.removeItem(STORAGE_KEY_USER);
      }
    }

    setIsLoading(false);
  }, []);

  // Set up token refresh interval
  useEffect(() => {
    if (!accessToken || !refreshToken) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    // Refresh token periodically
    const refreshTokenPeriodically = async () => {
      try {
        await refreshAccessToken();
      } catch (err) {
        console.error('Auto token refresh failed:', err);
        // Let user session expire naturally
      }
    };

    refreshIntervalRef.current = setInterval(refreshTokenPeriodically, TOKEN_REFRESH_INTERVAL);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [accessToken, refreshToken]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      const { access_token, refresh_token, user: userData } = data;

      // Store tokens and user info
      localStorage.setItem(STORAGE_KEY_ACCESS, access_token);
      localStorage.setItem(STORAGE_KEY_REFRESH, refresh_token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));

      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      setUser(userData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAccessToken = async () => {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        // Refresh failed - clear auth
        logout();
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      const { access_token, user: userData } = data;

      localStorage.setItem(STORAGE_KEY_ACCESS, access_token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));

      setAccessToken(access_token);
      setUser(userData);
    } catch (err) {
      logout();
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_ACCESS);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
    localStorage.removeItem(STORAGE_KEY_USER);

    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const setTokens = (access: string, refresh: string, userData: UserInfo) => {
    localStorage.setItem(STORAGE_KEY_ACCESS, access);
    localStorage.setItem(STORAGE_KEY_REFRESH, refresh);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));

    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(userData);
  };

  const value: AuthContextType = {
    isAuthenticated: !!user && !!accessToken,
    user,
    accessToken,
    refreshToken,
    isLoading,
    login,
    logout,
    refreshAccessToken,
    setTokens,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
