import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ShoppingCart, UserPlus, Package, Wallet, Receipt, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function QuickActionsMenu() {
  const navigate = useNavigate();
  const actions = [
    { label: "New Sale", icon: ShoppingCart, path: "/pos" },
    { label: "Add Customer", icon: UserPlus, path: "/customers" },
    { label: "Add Product", icon: Package, path: "/products" },
    { label: "Record Expense", icon: Wallet, path: "/expenses" },
    { label: "Create Invoice", icon: Receipt, path: "/orders" },
    { label: "Purchase Order", icon: ClipboardList, path: "/purchases" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Quick Actions</span>
          <span className="sm:hidden">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a) => (
          <DropdownMenuItem key={a.label} onClick={() => navigate(a.path)} className="gap-2 cursor-pointer">
            <a.icon className="h-4 w-4 text-muted-foreground" />
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
