/**
 * useRole Hook
 * Returns role information and permission checks for current user.
 * Used throughout the app to gate features and show/hide UI elements.
 */

import { useContext, useMemo } from 'react';
import { AuthContext } from '../contexts/AuthContext';

interface RoleInfo {
  role: 'admin' | 'manager' | 'viewer';
  isAdmin: boolean;
  isManager: boolean;
  isViewer: boolean;
  canEdit: boolean;
  canImport: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canDeleteData: boolean;
  canApproveWork: boolean;
  canViewFinancials: boolean;
  permissions: string[];
}

/**
 * useRole Hook
 * Provides role-based access control utilities.
 *
 * Usage:
 *   const { isAdmin, canImport, role } = useRole();
 *
 *   if (!canImport) {
 *     return <Alert>You don't have permission to import</Alert>;
 *   }
 */
export const useRole = (): RoleInfo => {
  const authContext = useContext(AuthContext);

  if (!authContext) {
    throw new Error('useRole must be used within AuthProvider');
  }

  const { user } = authContext;

  return useMemo(() => {
    const role = user?.role || 'viewer';
    const isAdmin = role === 'admin';
    const isManager = role === 'manager' || isAdmin;
    const isViewer = true; // All users can view

    // Permission matrix
    const permissions = {
      admin: [
        'view_all',
        'edit_all',
        'delete_all',
        'import',
        'export',
        'manage_users',
        'manage_organisation',
        'reconciliation',
        'system_settings',
        'view_financials',
        'approve_work',
      ],
      manager: [
        'view_all',
        'edit_properties',
        'edit_components',
        'edit_maintenance',
        'edit_tenants',
        'import',
        'export',
        'reconciliation',
        'manage_team',
        'approve_work',
      ],
      viewer: [
        'view_all',
        'export_own',
      ],
    };

    const userPermissions = permissions[role as keyof typeof permissions] || permissions.viewer;

    return {
      role: role as 'admin' | 'manager' | 'viewer',
      isAdmin,
      isManager,
      isViewer,
      canEdit: isManager || role === 'admin',
      canImport: isManager || role === 'admin',
      canExport: true, // All users can export
      canManageUsers: isAdmin,
      canDeleteData: isAdmin,
      canApproveWork: isManager,
      canViewFinancials: isAdmin,
      permissions: userPermissions,
    };
  }, [user?.role]);
};

/**
 * Helper to check if user has specific permission
 */
export const useHasPermission = (permission: string): boolean => {
  const { permissions } = useRole();
  return permissions.includes(permission);
};

/**
 * Helper to check if user has any of the specified roles
 */
export const useHasRole = (...roles: Array<'admin' | 'manager' | 'viewer'>): boolean => {
  const { role } = useRole();
  return roles.includes(role);
};
