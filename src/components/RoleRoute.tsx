import { Navigate, useLocation } from "react-router-dom";
import { useOrgRole, ROLE_LEVEL, type OrgRole } from "@/hooks/useOrgRole";
import { usePermissions } from "@/hooks/usePermissions";

interface RoleRouteProps {
  children: React.ReactNode;
  /** Minimum role needed. If not provided, uses path-based check. */
  requiredRole?: OrgRole;
  /** Optional permission key to check (takes precedence when provided). */
  requiredPermission?: string;
}

export function RoleRoute({ children, requiredRole, requiredPermission }: RoleRouteProps) {
  const { role, canAccess } = useOrgRole();
  const { has, loading } = usePermissions();
  const location = useLocation();

  if (requiredPermission) {
    if (loading) return null;
    if (!has(requiredPermission)) return <Navigate to="/pos" replace />;
    return <>{children}</>;
  }

  if (requiredRole) {
    const userLevel = ROLE_LEVEL[role] || 0;
    const requiredLevel = ROLE_LEVEL[requiredRole] || 0;
    if (userLevel < requiredLevel) {
      return <Navigate to="/pos" replace />;
    }
  } else if (!canAccess(location.pathname)) {
    return <Navigate to="/pos" replace />;
  }

  return <>{children}</>;
}
