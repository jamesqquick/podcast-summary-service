const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile challenge token against the siteverify API.
 * Returns true if the token is valid, false otherwise.
 * Never throws — the caller is responsible for returning the appropriate response.
 */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
