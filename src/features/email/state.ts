import type {
  EmailHistoryItem,
  EmailVersion,
  SavedEmailTemplate,
} from './types';

const SAVED_TEMPLATES_KEY = 'email.savedTemplates';
const EMAIL_HISTORY_KEY = 'email.history';
const EMAIL_VERSIONS_KEY = 'email.versions';

async function getFromStorage<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function setInStorage<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({
    [key]: value,
  });
}

export async function getSavedTemplates(): Promise<SavedEmailTemplate[]> {
  return getFromStorage<SavedEmailTemplate[]>(SAVED_TEMPLATES_KEY, []);
}

export async function setSavedTemplates(
  templates: SavedEmailTemplate[],
): Promise<void> {
  await setInStorage(SAVED_TEMPLATES_KEY, templates);
}

export async function getEmailHistory(): Promise<EmailHistoryItem[]> {
  return getFromStorage<EmailHistoryItem[]>(EMAIL_HISTORY_KEY, []);
}

export async function setEmailHistory(
  history: EmailHistoryItem[],
): Promise<void> {
  await setInStorage(EMAIL_HISTORY_KEY, history);
}

export async function getEmailVersions(): Promise<EmailVersion[]> {
  return getFromStorage<EmailVersion[]>(EMAIL_VERSIONS_KEY, []);
}

export async function setEmailVersions(
  versions: EmailVersion[],
): Promise<void> {
  await setInStorage(EMAIL_VERSIONS_KEY, versions);
}