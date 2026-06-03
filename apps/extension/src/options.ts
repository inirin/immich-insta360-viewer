import { DEFAULT_HELPER_URL, normalizeHelperUrl } from './helper-url.js';

const form = document.getElementById('options-form');
const helperUrlInput = document.getElementById('helper-url');
const viewerTokenInput = document.getElementById('viewer-token');
const statusElement = document.getElementById('status');

if (!(form instanceof HTMLFormElement)) {
  throw new Error('Missing options form');
}

if (!(helperUrlInput instanceof HTMLInputElement)) {
  throw new Error('Missing helper URL input');
}

if (!(viewerTokenInput instanceof HTMLInputElement)) {
  throw new Error('Missing viewer token input');
}

if (!(statusElement instanceof HTMLElement)) {
  throw new Error('Missing status element');
}

const optionsForm = form;
const helperUrlElement = helperUrlInput;
const viewerTokenElement = viewerTokenInput;
const saveStatusElement = statusElement;

void loadOptions();

optionsForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const helperUrl = normalizeHelperUrl(helperUrlElement.value, '');
  if (!helperUrl) {
    saveStatusElement.textContent = 'Use an http:// or https:// helper URL.';
    return;
  }

  const viewerToken = viewerTokenElement.value.trim();
  await chrome.storage.sync.set({ helperUrl, viewerToken });
  helperUrlElement.value = helperUrl;
  saveStatusElement.textContent = 'Saved';
});

async function loadOptions(): Promise<void> {
  const settings = await chrome.storage.sync.get({
    helperUrl: DEFAULT_HELPER_URL,
    viewerToken: '',
  });
  helperUrlElement.value = normalizeHelperUrl(settings.helperUrl);
  viewerTokenElement.value = typeof settings.viewerToken === 'string' ? settings.viewerToken : '';
}
