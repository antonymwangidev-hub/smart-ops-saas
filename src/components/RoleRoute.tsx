import { Navigate, useLocation } from "react-router-dom";
import { useOrgRole } from "@/hooks/useOrgRole";

interface RoleRouteProps {
  children: React.ReactNode;
  /** Minimum role needed. If not provided, uses path-based check. */
  requiredRole?: "admin" | "staff";
}

export function RoleRoute({ children, requiredRole }: RoleRouteProps) {
  const { role, canAccess } = useOrgRole();
  const location = useLocation();

  if (requiredRole) {
    const roleHierarchy = { admin: 3, staff: 2, attendant: 1 };
    const userLevel = roleHierarchy[role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    if (userLevel < requiredLevel) {
      return <Navigate to="/pos" replace />;
    }
  } else if (!canAccess(location.pathname)) {
    return <Navigate to="/pos" replace />;
  }

  return <>{children}</>;
}
