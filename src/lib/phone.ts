/**
 * Kenyan phone number helpers.
 *
 * Accepts the formats people actually type:
 *   0712345678, 0112345678 (Safaricom/Airtel/Telkom local format)
 *   712345678              (missing leading 0)
 *   254712345678           (international, no +)
 *   +254712345678          (international, with +)
 *   0712 345 678 / 0712-345-678 (with spaces or dashes)
 */

const KENYA_MOBILE_REGEX = /^(?:\+?254|0)?(7\d{8}|1\d{8})$/;

/** Strip everything except digits and a leading +. */
function cleanInput(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "");
}

/**
 * Returns true if the string is a valid Kenyan mobile number in any
 * common format. Use this before saving a number or sending WhatsApp/SMS.
 */
export function isValidKenyanPhone(raw: string): boolean {
  if (!raw) return false;
  const cleaned = cleanInput(raw);
  return KENYA_MOBILE_REGEX.test(cleaned);
}

/**
 * Converts any accepted format to E.164 international format
 * (e.g. "0712345678" -> "254712345678") for WhatsApp/SMS links.
 * Returns null if the input isn't a valid Kenyan mobile number.
 */
export function toInternationalFormat(raw: string): string | null {
  if (!isValidKenyanPhone(raw)) return null;
  const cleaned = cleanInput(raw).replace(/^\+/, "");
  if (cleaned.startsWith("254")) return cleaned;
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  // bare 9-digit number like 712345678
  return "254" + cleaned;
}

/**
 * Converts any accepted format to local display format
 * (e.g. "254712345678" -> "0712 345 678") for showing in UI.
 */
export function toLocalDisplayFormat(raw: string): string {
  const intl = toInternationalFormat(raw);
  if (!intl) return raw; // show as-typed if invalid, don't hide the user's input
  const local = "0" + intl.slice(3); // 254712345678 -> 0712345678
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/**
 * Human-readable validation message for inline form feedback.
 * Returns null when the number is valid (or empty, since phone is
 * usually optional — callers should check required separately).
 */
export function getPhoneValidationError(raw: string): string | null {
  if (!raw.trim()) return null;
  if (!isValidKenyanPhone(raw)) {
    return "Enter a valid number e.g. 0712345678";
  }
  return null;
}
