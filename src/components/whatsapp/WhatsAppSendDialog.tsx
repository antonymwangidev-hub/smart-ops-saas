import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
import { toInternationalFormat } from "@/lib/phone";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  phone: string | null;
}

export function WhatsAppSendDialog({ open, onOpenChange, customerId, customerName, phone }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [mode, setMode] = useState<"text" | "template">("text");
  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [variables, setVariables] = useState("");
  const [sending, setSending] = useState(false);

  const e164 = phone ? toInternationalFormat(phone) : null;

  const handleSend = async () => {
    if (!currentOrg || !e164) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-gateway", {
      body: {
        action: "send",
        organization_id: currentOrg.id,
        phone: `+${e164}`,
        customer_id: customerId,
        ...(mode === "template"
          ? {
              template_name: templateName.trim(),
              variables: variables.split(",").map((v) => v.trim()).filter(Boolean),
            }
          : { body: text.trim() }),
      },
    });
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      toast({ title: "Could not send", description: errMsg, variant: "destructive" });
    } else {
      toast({ title: "Message queued", description: `Sent to ${customerName}.` });
      setText("");
      setVariables("");
      onOpenChange(false);
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>WhatsApp {customerName}</DialogTitle>
          <DialogDescription>
            {e164 ? `+${e164}` : "This customer has no valid phone number."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium ${mode === "text" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >Free text</button>
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium ${mode === "template" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >Template</button>
          </div>

          {mode === "text" ? (
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Habari, your order is ready for pickup." />
              <p className="text-xs text-muted-foreground">
                Free text only works inside the 24-hour reply window. Use a template otherwise.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Template name</Label>
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="order_ready" />
              </div>
              <div className="space-y-1.5">
                <Label>Variables <span className="text-xs text-muted-foreground">(comma separated, in order)</span></Label>
                <Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="John, 2,500" />
              </div>
            </>
          )}

          <Button
            onClick={handleSend}
            disabled={sending || !e164 || (mode === "text" ? !text.trim() : !templateName.trim())}
            className="w-full"
          >
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
