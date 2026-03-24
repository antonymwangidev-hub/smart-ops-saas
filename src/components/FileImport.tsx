import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, FileText, Check, AlertCircle, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

type ImportTarget = "customers" | "orders";

interface ParsedRow {
  [key: string]: string | number | null;
}

interface ColumnMapping {
  source: string;
  target: string;
}

const CUSTOMER_FIELDS = [
  { value: "name", label: "Name", required: true },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "notes", label: "Notes" },
];

const ORDER_FIELDS = [
  { value: "amount", label: "Amount", required: true },
  { value: "status", label: "Status" },
  { value: "notes", label: "Notes" },
];

export function FileImport({ target, onComplete }: { target: ImportTarget; onComplete?: () => void }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importResult, setImportResult] = useState({ success: 0, errors: 0 });

  const fields = target === "customers" ? CUSTOMER_FIELDS : ORDER_FIELDS;

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setImportResult({ success: 0, errors: 0 });
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: null });

      if (data.length === 0) {
        toast({ title: "Empty file", description: "No data found in the file", variant: "destructive" });
        return;
      }

      const cols = Object.keys(data[0]);
      setHeaders(cols);
      setRows(data);

      // Auto-map columns by fuzzy match
      const autoMappings: ColumnMapping[] = cols.map((col) => {
        const lower = col.toLowerCase().trim();
        const match = fields.find((f) =>
          lower === f.value ||
          lower.includes(f.value) ||
          f.value.includes(lower) ||
          (f.value === "phone" && (lower.includes("tel") || lower.includes("mobile"))) ||
          (f.value === "amount" && (lower.includes("price") || lower.includes("total") || lower.includes("value")))
        );
        return { source: col, target: match?.value || "skip" };
      });
      setMappings(autoMappings);
      setStep("map");

      // Upload to storage for records
      if (currentOrg) {
        const path = `${currentOrg.id}/imports/${Date.now()}_${file.name}`;
        await supabase.storage.from("attachments").upload(path, file);
      }
    } catch (e: any) {
      toast({ title: "Parse error", description: e.message, variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!currentOrg || !user) return;
    setStep("importing");

    const activeMappings = mappings.filter((m) => m.target !== "skip");
    let success = 0;
    let errors = 0;

    for (const row of rows) {
      const record: Record<string, any> = { organization_id: currentOrg.id };
      for (const m of activeMappings) {
        record[m.target] = row[m.source];
      }

      if (target === "customers" && !record.name) {
        errors++;
        continue;
      }
      if (target === "orders") {
        record.amount = parseFloat(String(record.amount || 0));
        if (isNaN(record.amount)) { errors++; continue; }
        if (!["pending", "completed", "cancelled"].includes(record.status)) {
          record.status = "pending";
        }
      }

      const { error } = await supabase.from(target).insert(record);
      if (error) errors++;
      else success++;
    }

    setImportResult({ success, errors });
    setStep("done");

    await supabase.from("activity_logs").insert({
      organization_id: currentOrg.id,
      user_id: user.id,
      action: `bulk_import_${target}`,
      metadata: { file: fileName, imported: success, errors },
    });

    if (success > 0) onComplete?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {target === "customers" ? "Customers" : "Orders"}</DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm font-medium text-foreground">Drop your file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-2">Supports .xlsx, .csv files</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </motion.div>
          )}

          {step === "map" && (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
                <Badge variant="outline">{rows.length} rows</Badge>
              </div>
              <p className="text-sm font-medium">Map columns to fields:</p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {mappings.map((m, i) => (
                  <div key={m.source} className="flex items-center gap-3">
                    <span className="text-sm min-w-[120px] truncate font-mono text-muted-foreground">{m.source}</span>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={m.target}
                      onValueChange={(v) => {
                        const updated = [...mappings];
                        updated[i] = { ...m, target: v };
                        setMappings(updated);
                      }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip</SelectItem>
                        {fields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={() => setStep("preview")}>Preview</Button>
              </div>
            </motion.div>
          )}

          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-sm font-medium">Preview ({Math.min(rows.length, 5)} of {rows.length} rows)</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappings.filter(m => m.target !== "skip").map(m => (
                        <TableHead key={m.target}>{fields.find(f => f.value === m.target)?.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        {mappings.filter(m => m.target !== "skip").map(m => (
                          <TableCell key={m.target}>{String(row[m.source] ?? "—")}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
                <Button onClick={handleImport}>Import {rows.length} rows</Button>
              </div>
            </motion.div>
          )}

          {step === "importing" && (
            <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-12 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importing data...</p>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-12 gap-4">
              <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">Import Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.success} rows imported successfully
                  {importResult.errors > 0 && `, ${importResult.errors} errors`}
                </p>
              </div>
              <Button onClick={() => { setOpen(false); reset(); }}>Close</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
