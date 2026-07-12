// Kenya reference data used by customer/supplier forms.
export const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
] as const;

export type KenyaCounty = (typeof KENYA_COUNTIES)[number];

export const FARMER_TYPES = [
  { value: "dairy", label: "Dairy" },
  { value: "poultry", label: "Poultry" },
  { value: "beef", label: "Beef" },
  { value: "goat", label: "Goat / Sheep" },
  { value: "pig", label: "Pig" },
  { value: "crop", label: "Crop / Horticulture" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
] as const;

// Basic KRA PIN check: A + 9 digits + letter (e.g. A123456789Z).
// Accepts P (companies) or A (individuals) as the leading character.
export function isValidKraPin(pin: string): boolean {
  return /^[AP]\d{9}[A-Z]$/i.test(pin.trim());
}
