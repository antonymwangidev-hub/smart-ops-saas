import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Trash2, Loader2, Sparkles, Eye, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface DocFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  entity_type: string;
  created_at: string;
}

export default function Documents() {
  const { currentOrg } = useOrg();
  const { user, session } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const fetchDocs = async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("file_attachments")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .eq("entity_type", "business_document")
      .order("created_at", { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, [currentOrg]);

  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});

  const generateSummary = async (docId: string, fileName: string) => {
    if (!currentOrg || !session?.access_token) return;
    setSummarizing(prev => ({ ...prev, [docId]: true }));
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Generate a concise summary (3-5 bullet points) of the document "${fileName}". Focus on key insights, important data points, and actionable takeaways. If you can read the document content, analyze it. Otherwise, infer what you can from the filename and business context.`,
            }],
            orgId: currentOrg.id,
          }),
        }
      );
      if (!resp.ok) throw new Error("Summary failed");
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
                setSummaries(prev => ({ ...prev, [docId]: content }));
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      setSummaries(prev => ({ ...prev, [docId]: `Error: ${e.message}` }));
    } finally {
      setSummarizing(prev => ({ ...prev, [docId]: false }));
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !currentOrg || !user) return;
    setUploading(true);
    const uploadedDocIds: { id: string; name: string }[] = [];

    for (const file of Array.from(files)) {
      const path = `${currentOrg.id}/documents/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("attachments").upload(path, file);
      if (uploadErr) {
        toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);

      const { data: inserted, error: dbErr } = await supabase.from("file_attachments").insert({
        organization_id: currentOrg.id,
        entity_id: currentOrg.id,
        entity_type: "business_document",
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
      }).select("id").single();

      if (dbErr) {
        toast({ title: "Error saving record", description: dbErr.message, variant: "destructive" });
      } else if (inserted) {
        uploadedDocIds.push({ id: inserted.id, name: file.name });
      }
    }

    setUploading(false);
    toast({ title: "Upload complete", description: "Documents uploaded. Generating AI summaries..." });
    await fetchDocs();

    // Auto-generate summaries for uploaded documents
    for (const doc of uploadedDocIds) {
      generateSummary(doc.id, doc.name);
    }
  };

  const handleDelete = async (doc: DocFile) => {
    const path = doc.file_url.split("/attachments/")[1];
    if (path) await supabase.storage.from("attachments").remove([decodeURIComponent(path)]);
    await supabase.from("file_attachments").delete().eq("id", doc.id);
    fetchDocs();
  };

  const analyzeDocuments = async () => {
    if (!currentOrg || !session?.access_token || docs.length === 0) return;
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisOpen(true);

    try {
      const docList = docs.map(d => `- ${d.file_name} (${d.file_size ? (d.file_size / 1024).toFixed(1) + 'KB' : 'unknown size'}, uploaded ${new Date(d.created_at).toLocaleDateString()})`).join("\n");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Analyze my business documents and provide strategic recommendations. Here are my uploaded documents:\n${docList}\n\nBased on the business data you have access to (customers, orders, revenue trends), provide:\n1. Key observations about business health\n2. Actionable recommendations based on data trends\n3. Suggested next steps for growth\n4. Any risks or concerns to address`,
            }],
            orgId: currentOrg.id,
          }),
        }
      );

      if (!resp.ok) throw new Error("Analysis failed");

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
                setAnalysis(content);
              }
            } catch { break; }
          }
        }
      }
    } catch (e: any) {
      setAnalysis(`Error: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "📄";
    if (["doc", "docx"].includes(ext || "")) return "📝";
    if (["xls", "xlsx", "csv"].includes(ext || "")) return "📊";
    if (["txt", "md"].includes(ext || "")) return "📃";
    if (["jpg", "jpeg", "png", "gif"].includes(ext || "")) return "🖼️";
    return "📎";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Business Documents</h1>
            <p className="text-muted-foreground">
              Upload and manage your business documents. SmartOps AI can analyze them for insights.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  onClick={analyzeDocuments}
                  disabled={docs.length === 0 || analyzing}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Analysis
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    SmartOps AI Analysis
                  </DialogTitle>
                </DialogHeader>
                {analyzing && !analysis && (
                  <div className="flex flex-col items-center py-12 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Analyzing your business data...</p>
                  </div>
                )}
                {analysis && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{analysis}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}
              </DialogContent>
            </Dialog>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload Documents
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.rtf,.odt"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        </div>

        {/* Drop zone */}
        <Card
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleUpload(e.dataTransfer.files);
          }}
          className="border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Drop files here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              PDFs, Word docs, spreadsheets, text files, and images
            </p>
          </CardContent>
        </Card>

        {/* Documents table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uploaded Documents</CardTitle>
            <CardDescription>{docs.length} documents</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : docs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No documents uploaded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  docs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getFileIcon(doc.file_name)}</span>
                          <div className="flex flex-col">
                            <span className="font-medium truncate max-w-[300px]">{doc.file_name}</span>
                            {summaries[doc.id] && (
                              <div className="mt-1 text-xs text-muted-foreground prose prose-xs dark:prose-invert max-w-md">
                                <ReactMarkdown>{summaries[doc.id]}</ReactMarkdown>
                              </div>
                            )}
                            {summarizing[doc.id] && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Generating summary...
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatSize(doc.file_size)}</TableCell>
                      <TableCell>{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => generateSummary(doc.id, doc.file_name)}
                          disabled={summarizing[doc.id]}
                          title="Generate AI Summary"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(doc.file_url, "_blank")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(doc)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
