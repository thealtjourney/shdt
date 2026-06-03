import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  requiredRole?: 'admin' | 'manager' | 'viewer';
  children?: React.ReactNode;
}

/**
 * ProtectedRoute component to guard routes that require authentication.
 *
 * Usage:
 * <Routes>
 *   <Route path="/login" element={<Login />} />
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/map" element={<Map />} />
 *     <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>} />
 *   </Route>
 * </Routes>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole, children }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role if required
  if (requiredRole && user) {
    const hasRequiredRole = checkUserRole(user.role, requiredRole);
    if (!hasRequiredRole) {
      return <Navigate to="/map" replace />;
    }
  }

  // Render children or outlet (for nested routes)
  return children ? <>{children}</> : <Outlet />;
};

/**
 * Check if user role meets or exceeds required role.
 * Role hierarchy: admin > manager > viewer
 */
function checkUserRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 3,
    manager: 2,
    viewer: 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

interface AdminOnlyProps {
  children: React.ReactNode;
}

/**
 * Convenience component for admin-only routes
 */
export const AdminOnly: React.FC<AdminOnlyProps> = ({ children }) => {
  return (
    <ProtectedRoute requiredRole="admin">
      {children}
    </ProtectedRoute>
  );
};

interface ManagerOnlyProps {
  children: React.ReactNode;
}

/**
 * Convenience component for manager-only routes
 */
export const ManagerOnly: React.FC<ManagerOnlyProps> = ({ children }) => {
  return (
    <ProtectedRoute requiredRole="manager">
      {children}
    </ProtectedRoute>
  );
};

export default ProtectedRoute;
