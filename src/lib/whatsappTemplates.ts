/**
 * WhatsApp template helpers.
 *
 * Templates use double-brace placeholders: "Habari {{name}}, your order {{order}} is ready."
 * The placeholder order in the body is the order the gateway expects `variables` in.
 */

export interface WhatsAppTemplate {
  id: string;
  name: string;
  label: string;
  body: string;
  placeholders: string[];
  category: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_ -]{1,40})\s*\}\}/g;

/** Ordered, de-duplicated list of placeholder names found in a template body. */
export function extractPlaceholders(body: string): string[] {
  const out: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const key = match[1].trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Replace placeholders with supplied values; unknown keys stay visible as {{key}}. */
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(PLACEHOLDER_RE, (full, raw: string) => {
    const key = raw.trim();
    const val = values[key];
    return val && val.trim() ? val.trim() : full;
  });
}

/** Values ordered to match the template's placeholder order (for template sends). */
export function orderedVariables(placeholders: string[], values: Record<string, string>): string[] {
  return placeholders.map((p) => (values[p] ?? "").trim());
}
