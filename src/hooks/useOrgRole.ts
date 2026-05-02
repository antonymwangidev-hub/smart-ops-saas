import { useOrg } from "@/contexts/OrgContext";

export type OrgRole = "admin" | "staff" | "attendant";

// Routes each role can access
const ROLE_ROUTES: Record<OrgRole, string[]> = {
  admin: ["*"], // full access
  staff: [
    "/pos", "/daily-summary", "/credit-sales", "/products",
    "/dashboard", "/customers", "/orders", "/tasks", "/automations",
    "/documents", "/analytics", "/notifications", "/settings",
  ],
  attendant: ["/pos", "/daily-summary"],
};

export function useOrgRole() {
  const { currentOrg } = useOrg();
  const role = (currentOrg?.role as OrgRole) || "attendant";

  const canAccess = (path: string): boolean => {
    const allowed = ROLE_ROUTES[role];
    if (!allowed) return false;
    if (allowed.includes("*")) return true;
    return allowed.includes(path);
  };

  const isOwner = role === "admin";
  const isStaff = role === "staff";
  const isAttendant = role === "attendant";

  return { role, canAccess, isOwner, isStaff, isAttendant };
}
