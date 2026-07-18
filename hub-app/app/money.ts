// Shared money formatting, safe for both server and client bundles.
export function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
  })}`;
}
