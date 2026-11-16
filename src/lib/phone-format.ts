/** Remove whitespace and known invisible clipboard formatting, preserving visible input for validation. */
export function stripPhoneFormatting(value: string): string {
  // Keep this allowlist aligned with common.StripPhoneFormatting in the API.
  return value.replace(/[\s\u0085\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '');
}
