// Venmo has no public API for person-to-person payments, so settle-up uses its
// (undocumented but long-standing) deep link to open a pre-filled payment. The user
// confirms in Venmo, then records the payment here; we can't verify it was sent.

/** Venmo usernames: 5–30 letters, numbers, hyphens or underscores. */
const USERNAME = /^[A-Za-z0-9_-]{5,30}$/;

/** Normalise user input ("@Tony-Zhu ", a pasted profile URL) to a bare username, or null if invalid. */
export function parseVenmoUsername(input: string): string | null {
  let v = input.trim();
  const fromUrl = /venmo\.com\/(?:u\/)?([^/?#]+)/i.exec(v);
  if (fromUrl) v = fromUrl[1];
  v = v.replace(/^@/, "");
  return USERNAME.test(v) ? v : null;
}

/**
 * Link that opens Venmo's "pay" screen with recipient, amount and note filled in.
 * `app` uses the venmo:// scheme (phones with the app); otherwise the website.
 */
export function venmoPayUrl(username: string, amount: string, note: string, app: boolean): string {
  const params = new URLSearchParams({ txn: "pay", amount, note });
  if (app) params.set("recipients", username);
  // Encode spaces as %20: Venmo may show "+" literally in the note.
  const query = params.toString().replace(/\+/g, "%20");
  return app ? `venmo://paycharge?${query}` : `https://venmo.com/${encodeURIComponent(username)}?${query}`;
}
