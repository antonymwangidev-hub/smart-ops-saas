import { Navigate, useLocation } from "react-router-dom";
import { useOrgRole, ROLE_LEVEL, type OrgRole } from "@/hooks/useOrgRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrg } from "@/contexts/OrgContext";

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
  const { currentOrg, loading: orgLoading } = useOrg();
  const location = useLocation();

  // Wait for the org (and therefore the role) to resolve before deciding.
  // Without this, deep links redirect to /pos on first paint.
  // PrivateRoute handles the "no org at all" case.
  if (orgLoading || !currentOrg) return null;




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
