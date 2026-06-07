import { Navigate, useLocation } from "react-router-dom";
import { useOrgRole, ROLE_LEVEL, type OrgRole } from "@/hooks/useOrgRole";

interface RoleRouteProps {
  children: React.ReactNode;
  /** Minimum role needed. If not provided, uses path-based check. */
  requiredRole?: OrgRole;
}

export function RoleRoute({ children, requiredRole }: RoleRouteProps) {
  const { role, canAccess } = useOrgRole();
  const location = useLocation();

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
