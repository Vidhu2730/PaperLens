const AUTH_EMAIL_KEY = 'paperlens:user-email';

export async function getSavedEmail(): Promise<string | null> {
  const result = await browser.storage.local.get(AUTH_EMAIL_KEY);
  return (result[AUTH_EMAIL_KEY] as string) ?? null;
}

export async function saveEmail(email: string): Promise<void> {
  await browser.storage.local.set({ [AUTH_EMAIL_KEY]: email.trim().toLowerCase() });
}

export async function clearEmail(): Promise<void> {
  await browser.storage.local.remove(AUTH_EMAIL_KEY);
}
