import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, Package, AlertTriangle, Edit, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";

interface ProductForm {
  name: string;
  sku: string;
  description: string;
  price: string;
  cost_price: string;
  stock_quantity: string;
  low_stock_threshold: string;
  category: string;
}

const emptyForm: ProductForm = {
  name: "", sku: "", description: "", price: "", cost_price: "",
  stock_quantity: "0", low_stock_threshold: "10", category: "",
};

export default function Products() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["products", currentOrg?.id, page],
    queryFn: async () => {
      if (!currentOrg) return { products: [], count: 0 };
      const query = supabase
        .from("products" as any)
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, count, error } = await query as any;
      if (error) throw error;
      return { products: data || [], count: count || 0 };
    },
    enabled: !!currentOrg,
  });

  const products = data?.products || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const lowStockProducts = products.filter((p: any) => p.stock_quantity <= p.low_stock_threshold && p.is_active);

  const filteredProducts = products.filter((p: any) => {
    const matchesSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase());
    const matchesLowStock = !showLowStockOnly || (p.stock_quantity <= p.low_stock_threshold);
    return matchesSearch && matchesLowStock;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      const payload = {
        organization_id: currentOrg.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        stock_quantity: parseInt(form.stock_quantity) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
        category: form.category.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("products" as any).update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? "Product updated" : "Product created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Product deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("products" as any).update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const openEdit = (product: any) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku || "",
      description: product.description || "",
      price: String(product.price),
      cost_price: String(product.cost_price || ""),
      stock_quantity: String(product.stock_quantity),
      low_stock_threshold: String(product.low_stock_threshold),
      category: product.category || "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    saveMutation.mutate();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Products & Inventory</h1>
            <p className="text-muted-foreground">Manage your product catalog and stock levels</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Product</Button>
        </div>

        {/* Low-stock alert */}
        {lowStockProducts.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Low Stock Alert</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {lowStockProducts.length} product{lowStockProducts.length > 1 ? "s" : ""} below threshold:{" "}
                  {lowStockProducts.slice(0, 5).map((p: any) => `${p.name} (${p.stock_quantity})`).join(", ")}
                  {lowStockProducts.length > 5 && ` and ${lowStockProducts.length - 5} more`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showLowStockOnly} onCheckedChange={setShowLowStockOnly} id="low-stock-filter" />
            <Label htmlFor="low-stock-filter" className="text-sm text-muted-foreground cursor-pointer">Low stock only</Label>
          </div>
          <Badge variant="secondary">{totalCount} total</Badge>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filteredProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No products found</h3>
            <p className="text-muted-foreground mt-1">Add your first product to start tracking inventory</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product: any) => {
                  const isLow = product.stock_quantity <= product.low_stock_threshold;
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{product.name}</div>
                        {product.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">{product.sku || "—"}</TableCell>
                      <TableCell>{product.category ? <Badge variant="outline">{product.category}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right"><TableCell className="text-right">{formatAmount(product.price)}</TableCell></TableCell>
                      <TableCell className="text-right">
                        <span className={isLow && product.is_active ? "text-destructive font-medium" : ""}>
                          {product.stock_quantity}
                        </span>
                        {isLow && product.is_active && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-destructive" />}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleActive(product.id, product.is_active)}>
                          {product.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(product)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{product.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(product.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Stock Quantity</Label>
                  <Input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update Product" : "Add Product"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
