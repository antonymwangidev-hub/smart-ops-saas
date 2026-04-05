import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Smartphone, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { FileImport } from "@/components/FileImport";
import { MpesaPaymentDialog } from "@/components/MpesaPaymentDialog";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/csvExport";

type OrderStatus = "pending" | "completed" | "cancelled";
const PAGE_SIZE = 50;

interface Order {
  id: string;
  customer_id: string | null;
  amount: number;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  completed: "bg-success/10 text-success border-success/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Orders() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({ customer_id: "", amount: "", status: "pending" as OrderStatus, notes: "" });
  const [mpesaOrder, setMpesaOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(0);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders", currentOrg?.id, page],
    queryFn: async () => {
      if (!currentOrg) return { orders: [], count: 0 };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("orders")
        .select("*, customers(name)", { count: "exact" })
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { orders: (data || []) as Order[], count: count || 0 };
    },
    enabled: !!currentOrg,
  });

  const { data: customersList } = useQuery({
    queryKey: ["customers_list", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase.from("customers").select("id, name").eq("organization_id", currentOrg.id);
      return data || [];
    },
    enabled: !!currentOrg,
  });

  const orders = ordersData?.orders || [];
  const totalCount = ordersData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const customers = customersList || [];

  // Realtime subscription
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase.channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `organization_id=eq.${currentOrg.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["orders", currentOrg.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg, queryClient]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !user) throw new Error("Missing context");
      const { error } = await supabase.from("orders").insert({
        organization_id: currentOrg.id,
        customer_id: form.customer_id || null,
        amount: parseFloat(form.amount),
        status: form.status,
        notes: form.notes || null,
      });
      if (error) throw error;
      await supabase.from("activity_logs").insert({
        organization_id: currentOrg.id, user_id: user.id, action: "order_created",
        metadata: { amount: form.amount },
      });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setForm({ customer_id: "", amount: "", status: "pending", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["orders", currentOrg?.id] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      if (!currentOrg || !user) throw new Error("Missing context");
      await supabase.from("orders").update({ status }).eq("id", orderId);
      await supabase.from("activity_logs").insert({
        organization_id: currentOrg.id, user_id: user.id, action: "order_status_updated",
        metadata: { order_id: orderId, status },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", currentOrg?.id] }),
  });

  const filtered = statusFilter === "all" ? orders : orders.filter(o => o.status === statusFilter);

  const handleExport = () => {
    exportToCSV(
      orders.map(o => ({
        Customer: o.customers?.name || "", Amount: o.amount, Status: o.status,
        Notes: o.notes || "", Created: o.created_at,
      })),
      "orders"
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Orders</h1>
            <p className="text-muted-foreground">{totalCount} total orders</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Order</Button>
              </DialogTrigger>
              <FileImport target="orders" onComplete={() => queryClient.invalidateQueries({ queryKey: ["orders", currentOrg?.id] })} />
              <DialogContent>
                <DialogHeader><DialogTitle>Create Order</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Order
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-2">
          {["all", "pending", "completed", "cancelled"].map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No orders found</TableCell></TableRow>
                ) : filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.customers?.name || "—"}</TableCell>
                    <TableCell>{formatAmount(Number(o.amount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[o.status]}>{o.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right flex items-center gap-2 justify-end">
                      {o.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setMpesaOrder(o)} className="gap-1">
                          <Smartphone className="h-3.5 w-3.5" />
                          M-Pesa
                        </Button>
                      )}
                      <Select value={o.status} onValueChange={(v) => updateStatusMutation.mutate({ orderId: o.id, status: v as OrderStatus })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <MpesaPaymentDialog
        open={!!mpesaOrder}
        onOpenChange={(open) => !open && setMpesaOrder(null)}
        orderId={mpesaOrder?.id || ""}
        amount={mpesaOrder?.amount || 0}
        customerName={mpesaOrder?.customers?.name || undefined}
      />
    </AppLayout>
  );
}
