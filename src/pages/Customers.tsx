import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Download, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileImport } from "@/components/FileImport";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/csvExport";
import { KENYA_COUNTIES, FARMER_TYPES, isValidKraPin } from "@/lib/kenya";
import { getPhoneValidationError, toInternationalFormat } from "@/lib/phone";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";

const PAGE_SIZE = 50;

interface Customer {
  id: string;
  name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  county: string | null;
  sub_county: string | null;
  village: string | null;
  farmer_type: string | null;
  credit_limit: number | null;
  kra_pin: string | null;
  whatsapp_opt_in: boolean | null;
  whatsapp_opt_in_source: string | null;
  created_at: string;
}

const emptyForm = {
  name: "",
  business_name: "",
  email: "",
  phone: "",
  notes: "",
  county: "",
  sub_county: "",
  village: "",
  farmer_type: "",
  credit_limit: "",
  kra_pin: "",
  whatsapp_opt_in: false,
  whatsapp_opt_in_source: "",
};


export default function Customers() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [page, setPage] = useState(0);
  const [waTarget, setWaTarget] = useState<Customer | null>(null);


  const { data, isLoading } = useQuery({
    queryKey: ["customers", currentOrg?.id, page],
    queryFn: async () => {
      if (!currentOrg) return { customers: [], count: 0 };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { customers: (data || []) as Customer[], count: count || 0 };
    },
    enabled: !!currentOrg,
  });

  const customers = data?.customers || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !user) throw new Error("Missing context");
      if (form.kra_pin && !isValidKraPin(form.kra_pin)) {
        throw new Error("KRA PIN must look like A123456789Z");
      }
      const phoneError = getPhoneValidationError(form.phone);
      if (phoneError) throw new Error(phoneError);
      if (form.whatsapp_opt_in && !form.whatsapp_opt_in_source.trim()) {
        throw new Error("Record how WhatsApp consent was obtained.");
      }
      if (form.whatsapp_opt_in && !toInternationalFormat(form.phone || "")) {
        throw new Error("A valid phone number is required for WhatsApp opt-in.");
      }
      const wasOptedIn = !!editing?.whatsapp_opt_in;
      const payload: any = {
        name: form.name,
        business_name: form.business_name || null,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
        county: form.county || null,
        sub_county: form.sub_county || null,
        village: form.village || null,
        farmer_type: form.farmer_type || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        kra_pin: form.kra_pin ? form.kra_pin.toUpperCase() : null,
        whatsapp_opt_in: form.whatsapp_opt_in,
        whatsapp_opt_in_source: form.whatsapp_opt_in ? form.whatsapp_opt_in_source.trim() : null,
        ...(form.whatsapp_opt_in && !wasOptedIn ? { whatsapp_opt_in_at: new Date().toISOString() } : {}),
        ...(!form.whatsapp_opt_in ? { whatsapp_opt_in_at: null } : {}),
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
        await supabase.from("activity_logs").insert({
          organization_id: currentOrg.id, user_id: user.id, action: "customer_updated",
          metadata: { customer_id: editing.id, name: form.name },
        });
      } else {
        const { error } = await supabase.from("customers").insert({
          organization_id: currentOrg.id, ...payload,
        });
        if (error) throw error;
        await supabase.from("activity_logs").insert({
          organization_id: currentOrg.id, user_id: user.id, action: "customer_created",
          metadata: { name: form.name },
        });
      }

      // Mirror consent to the WhatsApp gateway (best effort — never blocks the save)
      const e164 = form.phone ? toInternationalFormat(form.phone) : null;
      if (e164) {
        const { data: syncData } = await supabase.functions.invoke("whatsapp-gateway", {
          body: {
            action: "sync_contact",
            organization_id: currentOrg.id,
            phone: `+${e164}`,
            display_name: form.name,
            opt_in: form.whatsapp_opt_in,
            opt_in_source: form.whatsapp_opt_in ? form.whatsapp_opt_in_source.trim() : "",
          },
        });
        const syncErr = (syncData as any)?.error;
        if (syncErr) return { warning: `Saved, but WhatsApp contact sync failed: ${syncErr}` };
      }
      return {};
    },
    onSuccess: (res: any) => {
      if (res?.warning) toast({ title: "Customer saved", description: res.warning });

      setDialogOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
      queryClient.invalidateQueries({ queryKey: ["customers", currentOrg?.id] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers", currentOrg?.id] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      business_name: c.business_name || "",
      email: c.email || "",
      phone: c.phone || "",
      notes: c.notes || "",
      county: c.county || "",
      sub_county: c.sub_county || "",
      village: c.village || "",
      farmer_type: c.farmer_type || "",
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
      kra_pin: c.kra_pin || "",
      whatsapp_opt_in: !!c.whatsapp_opt_in,
      whatsapp_opt_in_source: c.whatsapp_opt_in_source || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.business_name && c.business_name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.county && c.county.toLowerCase().includes(q))
    );
  });

  const handleExport = () => {
    exportToCSV(
      customers.map(c => ({
        Name: c.name,
        Business: c.business_name || "",
        Email: c.email || "",
        Phone: c.phone || "",
        County: c.county || "",
        SubCounty: c.sub_county || "",
        Village: c.village || "",
        FarmerType: c.farmer_type || "",
        CreditLimit: c.credit_limit ?? "",
        KRAPin: c.kra_pin || "",
        Notes: c.notes || "",
        Created: c.created_at,
      })),
      "customers"
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-muted-foreground">{totalCount} total customers</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
              </DialogTrigger>
              <FileImport target="customers" onComplete={() => queryClient.invalidateQueries({ queryKey: ["customers", currentOrg?.id] })} />
              <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Full Name *</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Business / Farm Name</Label>
                      <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} maxLength={120} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XX XXX XXX" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>County</Label>
                      <Select value={form.county} onValueChange={(v) => setForm({ ...form, county: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {KENYA_COUNTIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Sub-County</Label>
                      <Input value={form.sub_county} onChange={(e) => setForm({ ...form, sub_county: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Village / Ward</Label>
                      <Input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Farmer Type</Label>
                      <Select value={form.farmer_type} onValueChange={(v) => setForm({ ...form, farmer_type: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {FARMER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Credit Limit (KES)</Label>
                      <Input type="number" min="0" step="1" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>KRA PIN <span className="text-muted-foreground text-xs">(optional, e.g. A123456789Z)</span></Label>
                    <Input value={form.kra_pin} onChange={(e) => setForm({ ...form, kra_pin: e.target.value.toUpperCase() })} maxLength={11} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="wa-opt-in"
                        checked={form.whatsapp_opt_in}
                        onCheckedChange={(v) => setForm({ ...form, whatsapp_opt_in: v === true })}
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="wa-opt-in" className="cursor-pointer">Customer consented to WhatsApp messages</Label>
                        <p className="text-xs text-muted-foreground">
                          Only opted-in contacts can be messaged. {getPhoneValidationError(form.phone) || ""}
                        </p>
                      </div>
                    </div>
                    {form.whatsapp_opt_in && (
                      <div className="space-y-1.5">
                        <Label>How was consent obtained? *</Label>
                        <Input
                          value={form.whatsapp_opt_in_source}
                          onChange={(e) => setForm({ ...form, whatsapp_opt_in_source: e.target.value })}
                          placeholder="e.g. Signed in-store form, 17 Aug 2026"
                          maxLength={200}
                        />
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editing ? "Update" : "Create"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Search by name, phone, business, county..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
                  ) : filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.business_name && <div className="text-xs text-muted-foreground">{c.business_name}</div>}
                        {c.kra_pin && <div className="text-[10px] text-muted-foreground font-mono">PIN: {c.kra_pin}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {c.phone && <div>{c.phone}</div>}
                          {c.email && <div className="text-muted-foreground">{c.email}</div>}
                          {!c.phone && !c.email && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {c.county ? <div>{c.county}</div> : <span className="text-muted-foreground">—</span>}
                          {(c.sub_county || c.village) && (
                            <div className="text-muted-foreground">
                              {[c.sub_county, c.village].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.farmer_type
                          ? <Badge variant="secondary" className="capitalize">{c.farmer_type}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {c.credit_limit != null ? formatAmount(Number(c.credit_limit)) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const canMessage = !!c.whatsapp_opt_in && !!c.phone && !!toInternationalFormat(c.phone);
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!canMessage}
                                    onClick={() => setWaTarget(c)}
                                    aria-label={`Send WhatsApp to ${c.name}`}
                                  >
                                    <MessageSquare className={`h-4 w-4 ${canMessage ? "text-success" : ""}`} />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {canMessage
                                  ? "Send a WhatsApp message"
                                  : !c.whatsapp_opt_in
                                    ? "Customer has not opted in to WhatsApp"
                                    : "Add a valid phone number first"}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete customer?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{c.name}</strong>. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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

        <WhatsAppSendDialog
          open={!!waTarget}
          onOpenChange={(o) => !o && setWaTarget(null)}
          customerId={waTarget?.id ?? null}
          customerName={waTarget?.name ?? ""}
          phone={waTarget?.phone ?? null}
        />
      </div>

    </AppLayout>
  );
}
