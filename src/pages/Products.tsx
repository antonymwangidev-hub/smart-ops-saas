import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Loader2, Package, AlertTriangle, Edit, Trash2, Search,
  Upload, Download, CheckCircle2, XCircle, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────────────────────
interface ProductForm {
  name: string; sku: string; barcode: string; description: string;
  price: string; cost_price: string; stock_quantity: string;
  low_stock_threshold: string; category: string; unit_of_measure: string;
  tax_rate: string; batch_number: string; expiry_date: string;
}

const emptyForm: ProductForm = {
  name: "", sku: "", barcode: "", description: "", price: "", cost_price: "",
  stock_quantity: "0", low_stock_threshold: "10", category: "",
  unit_of_measure: "pcs", tax_rate: "0", batch_number: "", expiry_date: "",
};

// ── CSV template columns ───────────────────────────────────────────────
const CSV_TEMPLATE_COLS = [
  "name", "sku", "barcode", "category", "unit_of_measure",
  "price", "cost_price", "stock_quantity", "low_stock_threshold",
  "tax_rate", "description", "batch_number", "expiry_date",
];

const EXAMPLE_ROWS = [
  ["Hammer 16oz", "HMR-001", "", "Tools", "pcs", "850", "400", "50", "10", "16", "Claw hammer", "", ""],
  ["Portland Cement 50kg", "CEM-001", "5060123456789", "Building", "bag", "980", "700", "200", "30", "16", "Grey Portland", "B2024-01", "2026-12-31"],
  ["Paint 4L White", "PNT-001", "", "Paint", "tin", "1200", "800", "80", "20", "16", "", "", ""],
];

interface ImportRow {
  rowNum: number;
  data: Record<string, any>;
  errors: string[];
  isDuplicate: boolean;
  status: "ok" | "error" | "duplicate";
}

export default function Products() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();

  // Product form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Import state
  const [activeTab, setActiveTab] = useState("products");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStep, setImportStep] = useState<"idle" | "preview" | "importing" | "done">("idle");
  const [importResult, setImportResult] = useState({ success: 0, skipped: 0, errors: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["products", currentOrg?.id, page],
    queryFn: async () => {
      if (!currentOrg) return { products: [], count: 0 };
      const { data, count, error } = await (supabase as any)
        .from("products")
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return { products: data || [], count: count || 0 };
    },
    enabled: !!currentOrg,
  });

  // Fetch all SKUs for duplicate detection
  const { data: allSkus = [] } = useQuery({
    queryKey: ["product_skus", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("products").select("sku, name").eq("organization_id", currentOrg.id);
      return (data || []) as { sku: string; name: string }[];
    },
    enabled: !!currentOrg,
  });

  const products = data?.products || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const lowStockProducts = products.filter((p: any) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold && p.is_active);
  const outOfStockProducts = products.filter((p: any) => p.stock_quantity <= 0 && p.is_active);
  const expiringSoon = products.filter((p: any) => {
    if (!p.expiry_date) return false;
    const diff = (new Date(p.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= -7;
  });
  const deadStock = products.filter((p: any) => {
    if (!p.is_active || p.stock_quantity <= 0) return false;
    return (Date.now() - new Date(p.updated_at).getTime()) > 1000 * 60 * 60 * 24 * 60;
  });

  const filteredProducts = products.filter((p: any) => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q);
    const matchLow = !showLowStockOnly || p.stock_quantity <= p.low_stock_threshold;
    return matchSearch && matchLow;
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      const payload = {
        organization_id: currentOrg.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        stock_quantity: parseInt(form.stock_quantity) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
        category: form.category.trim() || null,
        unit_of_measure: form.unit_of_measure.trim() || "pcs",
        tax_rate: parseFloat(form.tax_rate) || 0,
        batch_number: form.batch_number.trim() || null,
        expiry_date: form.expiry_date || null,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_skus"] });
      setDialogOpen(false); setEditingId(null); setForm(emptyForm);
      toast({ title: editingId ? "Product updated" : "Product created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Product deleted" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleActive = async (id: string, current: boolean) => {
    await (supabase as any).from("products").update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const openEdit = (product: any) => {
    setEditingId(product.id);
    setForm({
      name: product.name, sku: product.sku || "", barcode: product.barcode || "",
      description: product.description || "", price: String(product.price),
      cost_price: String(product.cost_price || ""), stock_quantity: String(product.stock_quantity),
      low_stock_threshold: String(product.low_stock_threshold), category: product.category || "",
      unit_of_measure: product.unit_of_measure || "pcs", tax_rate: String(product.tax_rate ?? 0),
      batch_number: product.batch_number || "", expiry_date: product.expiry_date ? String(product.expiry_date).slice(0, 10) : "",
    });
    setDialogOpen(true);
  };

  // ── CSV/Excel Import ───────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([CSV_TEMPLATE_COLS, ...EXAMPLE_ROWS]);
    // Column widths
    ws["!cols"] = CSV_TEMPLATE_COLS.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "smartops_products_template.xlsx");
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    setImportFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rawRows.length === 0) { toast({ title: "File is empty", variant: "destructive" }); return; }

      const existingSkus = new Set(allSkus.map((s) => (s.sku || "").toLowerCase().trim()));
      const existingNames = new Set(allSkus.map((s) => (s.name || "").toLowerCase().trim()));
      const seenInFile = new Set<string>();

      const parsed: ImportRow[] = rawRows.map((row, idx) => {
        const errors: string[] = [];
        const name = String(row["name"] || row["Name"] || row["PRODUCT NAME"] || row["product_name"] || "").trim();
        const sku = String(row["sku"] || row["SKU"] || row["Code"] || "").trim();
        const price = parseFloat(String(row["price"] || row["Price"] || row["PRICE"] || "0").replace(/[^0-9.-]/g, ""));
        const cost = parseFloat(String(row["cost_price"] || row["Cost"] || row["COST"] || "0").replace(/[^0-9.-]/g, ""));
        const stock = parseInt(String(row["stock_quantity"] || row["Stock"] || row["Qty"] || "0").replace(/[^0-9-]/g, "")) || 0;
        const threshold = parseInt(String(row["low_stock_threshold"] || row["Min Stock"] || "10")) || 10;
        const taxRate = parseFloat(String(row["tax_rate"] || row["VAT"] || row["Tax"] || "16")) || 0;
        const category = String(row["category"] || row["Category"] || "").trim();
        const unit = String(row["unit_of_measure"] || row["Unit"] || "pcs").trim() || "pcs";
        const description = String(row["description"] || row["Description"] || "").trim();
        const barcode = String(row["barcode"] || row["Barcode"] || "").trim();
        const batchNum = String(row["batch_number"] || row["Batch"] || "").trim();
        const expiryRaw = row["expiry_date"] || row["Expiry"] || row["Expiry Date"] || "";
        let expiryDate = "";
        if (expiryRaw instanceof Date) expiryDate = expiryRaw.toISOString().split("T")[0];
        else if (expiryRaw) expiryDate = String(expiryRaw).slice(0, 10);

        if (!name) errors.push("Name is required");
        if (isNaN(price) || price < 0) errors.push("Invalid price");
        if (price === 0 && !isNaN(price)) { /* 0 price allowed, just note */ }

        const skuKey = sku.toLowerCase();
        const nameKey = name.toLowerCase();
        let isDuplicate = false;

        // Check against DB
        if (sku && existingSkus.has(skuKey)) { isDuplicate = true; errors.push(`SKU "${sku}" already exists in inventory`); }
        else if (existingNames.has(nameKey)) { isDuplicate = true; errors.push(`Product "${name}" already exists (name match)`); }
        // Check within the file itself
        const fileKey = sku || nameKey;
        if (seenInFile.has(fileKey)) { isDuplicate = true; errors.push("Duplicate within import file"); }
        else seenInFile.add(fileKey);

        return {
          rowNum: idx + 2,
          data: { name, sku, barcode, category, unit_of_measure: unit, price, cost_price: cost, stock_quantity: stock, low_stock_threshold: threshold, tax_rate: taxRate, description, batch_number: batchNum, expiry_date: expiryDate },
          errors,
          isDuplicate,
          status: errors.length > 0 ? (isDuplicate ? "duplicate" : "error") : "ok",
        };
      });

      setImportRows(parsed);
      setImportStep("preview");
      setActiveTab("import");
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    }
  };

  const runImport = async () => {
    if (!currentOrg) return;
    const toImport = importRows.filter((r) => r.status === "ok");
    if (toImport.length === 0) { toast({ title: "No valid rows to import", variant: "destructive" }); return; }

    setImportStep("importing");
    let success = 0, errors = 0;

    for (const row of toImport) {
      const { error } = await (supabase as any).from("products").insert({
        organization_id: currentOrg.id,
        is_active: true,
        ...row.data,
        expiry_date: row.data.expiry_date || null,
      });
      if (error) errors++;
      else success++;
    }

    setImportResult({ success, skipped: importRows.filter((r) => r.status !== "ok").length, errors });
    setImportStep("done");
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product_skus"] });
    toast({ title: `Imported ${success} products` });
  };

  const resetImport = () => {
    setImportRows([]); setImportFileName(""); setImportStep("idle");
    if (fileRef.current) fileRef.current.value = "";
  };

  const okCount = importRows.filter((r) => r.status === "ok").length;
  const dupCount = importRows.filter((r) => r.status === "duplicate").length;
  const errCount = importRows.filter((r) => r.status === "error").length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Products & Inventory</h1>
            <p className="text-muted-foreground">Manage your product catalog and stock levels</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Template
            </Button>
            <Button variant="outline" onClick={() => { setActiveTab("import"); fileRef.current?.click(); }} className="gap-2">
              <Upload className="h-4 w-4" /> Bulk Import
            </Button>
            <Button onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </div>
        </div>

        {/* ── Stock intelligence cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Out of stock</div><div className="text-2xl font-bold text-destructive">{outOfStockProducts.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Low stock</div><div className="text-2xl font-bold text-warning">{lowStockProducts.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Expiring ≤30d</div><div className="text-2xl font-bold text-orange-500">{expiringSoon.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Dead stock (60d)</div><div className="text-2xl font-bold text-muted-foreground">{deadStock.length}</div></CardContent></Card>
        </div>

        {expiringSoon.length > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-orange-500">Expiring Products</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {expiringSoon.slice(0, 5).map((p: any) => `${p.name} (${p.expiry_date})`).join(", ")}
                  {expiringSoon.length > 5 && ` +${expiringSoon.length - 5} more`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs: Products / Bulk Import ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="products">Products ({totalCount})</TabsTrigger>
            <TabsTrigger value="import">
              Bulk Import
              {importStep === "preview" && <Badge className="ml-2 h-5 text-[10px]">{importRows.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── PRODUCTS TAB ── */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showLowStockOnly} onCheckedChange={setShowLowStockOnly} id="low-stock-filter" />
                <Label htmlFor="low-stock-filter" className="text-sm text-muted-foreground cursor-pointer">Low stock only</Label>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredProducts.length === 0 ? (
              <Card className="p-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">No products found</h3>
                <p className="text-muted-foreground mt-1 text-sm">Add products one by one or use Bulk Import for large catalogs</p>
                <div className="flex gap-2 justify-center mt-4">
                  <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" />Download Template</Button>
                  <Button onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add First Product</Button>
                </div>
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
                          <TableCell className="text-right">{formatAmount(product.price)}</TableCell>
                          <TableCell className="text-right">
                            <span className={isLow && product.is_active ? "text-destructive font-medium" : ""}>
                              {product.stock_quantity} {product.unit_of_measure || ""}
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
                              <Button size="icon" variant="ghost" onClick={() => openEdit(product)}><Edit className="h-4 w-4" /></Button>
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages} · {totalCount} products total</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── BULK IMPORT TAB ── */}
          <TabsContent value="import" className="space-y-4">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.ods" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }} />

            {importStep === "idle" && (
              <Card>
                <CardContent className="p-8 space-y-4">
                  <div className="text-center space-y-2">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
                    <h3 className="text-lg font-medium">Bulk Import Products</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Import hundreds of products at once from an Excel or CSV file. Download the template first — it includes example hardware products.
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" /> Download Template (.xlsx)</Button>
                    <Button onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Choose File</Button>
                  </div>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f); }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <p className="text-sm text-muted-foreground">…or drag & drop an Excel / CSV file here</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
                    <p className="font-medium">Supported columns (auto-detected):</p>
                    <p className="text-muted-foreground font-mono text-xs">{CSV_TEMPLATE_COLS.join(" · ")}</p>
                    <p className="text-muted-foreground text-xs mt-2">Column names are flexible — "Name", "PRODUCT NAME", "product_name" all work. Duplicates (by SKU or name) are flagged automatically.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {importStep === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-medium">Preview: {importFileName}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> {okCount} ready</span>
                      {dupCount > 0 && <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" /> {dupCount} duplicates</span>}
                      {errCount > 0 && <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3 w-3" /> {errCount} errors</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetImport}>Cancel</Button>
                    <Button onClick={runImport} disabled={okCount === 0} className="gap-2">
                      <Upload className="h-4 w-4" /> Import {okCount} Products
                    </Button>
                  </div>
                </div>

                <Card>
                  <div className="max-h-[450px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead>Issues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.map((row) => (
                          <TableRow key={row.rowNum} className={
                            row.status === "ok" ? "" :
                            row.status === "duplicate" ? "bg-warning/5" : "bg-destructive/5"
                          }>
                            <TableCell className="text-xs text-muted-foreground">{row.rowNum}</TableCell>
                            <TableCell>
                              {row.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-success" /> :
                               row.status === "duplicate" ? <Eye className="h-4 w-4 text-warning" /> :
                               <XCircle className="h-4 w-4 text-destructive" />}
                            </TableCell>
                            <TableCell className="font-medium max-w-[160px] truncate">{row.data.name || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{row.data.sku || "—"}</TableCell>
                            <TableCell>{row.data.category || "—"}</TableCell>
                            <TableCell className="text-right">KES {Number(row.data.price).toFixed(0)}</TableCell>
                            <TableCell className="text-right">{row.data.stock_quantity}</TableCell>
                            <TableCell className="text-xs text-destructive max-w-[200px]">
                              {row.errors.join("; ") || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            )}

            {importStep === "importing" && (
              <Card><CardContent className="p-12 flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Importing products into inventory…</p>
              </CardContent></Card>
            )}

            {importStep === "done" && (
              <Card><CardContent className="p-12 flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="h-14 w-14 text-success" />
                <div>
                  <h3 className="text-xl font-bold">Import Complete</h3>
                  <p className="text-muted-foreground mt-1">
                    <span className="text-success font-medium">{importResult.success} imported</span>
                    {importResult.skipped > 0 && <span className="text-warning"> · {importResult.skipped} skipped</span>}
                    {importResult.errors > 0 && <span className="text-destructive"> · {importResult.errors} failed</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetImport}>Import Another File</Button>
                  <Button onClick={() => setActiveTab("products")}>View Products</Button>
                </div>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Create / Edit Dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                <div className="space-y-2"><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type" /></div>
                <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div className="space-y-2"><Label>Unit (pcs, kg, ltr…)</Label><Input value={form.unit_of_measure} onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })} /></div>
                <div className="space-y-2"><Label>Selling Price (KES)</Label><Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div className="space-y-2"><Label>Cost Price (KES)</Label><Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
                <div className="space-y-2"><Label>Stock Quantity</Label><Input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} /></div>
                <div className="space-y-2"><Label>Low Stock Alert</Label><Input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
                <div className="space-y-2"><Label>VAT Rate (%)</Label><Input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></div>
                <div className="space-y-2"><Label>Batch Number</Label><Input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} /></div>
                <div className="space-y-2 col-span-2"><Label>Expiry Date (perishables / pharma)</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                <div className="space-y-2 col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <Button className="w-full" disabled={saveMutation.isPending || !form.name.trim()} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
