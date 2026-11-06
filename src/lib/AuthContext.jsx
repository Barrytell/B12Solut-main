import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/api/client';

const AuthContext = createContext();

/**
 * Supabase session + the app user from GET /api/auth/me. Same context shape as
 * before (user, isAuthenticated, isLoadingAuth, authError, logout,
 * navigateToLogin, checkAppState), so ProtectedRoute and AdminRoute are unchanged.
 * The role comes from the server's app_users row, never from token metadata.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadUser = useCallback(async (session) => {
    if (!session) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      setIsLoadingAuth(false);
      return;
    }
    try {
      const { user: appUser } = await api.auth.me();
      setUser(appUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      if (error.code === 'USER_NOT_REGISTERED') {
        setAuthError({ type: 'user_not_registered', message: error.message });
      } else if (error.status === 401) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({ type: 'unknown', message: error.message || 'Could not load your account' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    const { data } = await supabase.auth.getSession();
    await loadUser(data.session);
  }, [loadUser]);

  useEffect(() => {
    checkAppState();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: supabase-js must not be awaited inside its own auth callback.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => loadUser(session), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkAppState, loadUser]);

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) window.location.href = '/login';
  };

  const navigateToLogin = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      logout,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
