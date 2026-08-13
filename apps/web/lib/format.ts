const exactLabels: Record<string, string> = {
  API: "API",
  EMAIL: "Email",
  EMAIL_AND_LINKEDIN: "Email and LinkedIn",
  GBP: "GBP",
  GMAIL: "Gmail",
  LINKEDIN: "LinkedIn",
  MFA: "MFA",
  SMS: "SMS",
  URL: "URL",
  USD: "USD",
};

export function formatLabel(value: string | null | undefined, fallback = "Not set"): string {
  if (!value) return fallback;
  if (exactLabels[value]) return exactLabels[value];
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase())
    .replace(/\bLinkedin\b/g, "LinkedIn")
    .replace(/\bGmail\b/g, "Gmail");
}
