import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({ permission, anyOf, fallback = null, children }: Props) {
  const { has, hasAny, loading } = usePermissions();
  if (loading) return null;
  const ok = permission ? has(permission) : anyOf ? hasAny(...anyOf) : true;
  return <>{ok ? children : fallback}</>;
}
