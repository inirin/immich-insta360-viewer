import { extractAssetIdFromUrl } from './asset-id.js';
import { DEFAULT_HELPER_URL, normalizeHelperUrl } from './helper-url.js';

const MENU_ID = 'open-immich-insta360-viewer';
const MENU_TITLE = 'Insta360 360 \u{bdf0}\u{c5b4}\u{b85c} \u{c5f4}\u{ae30}';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: MENU_TITLE,
    contexts: ['page', 'video', 'image', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (_info, tab) => {
  const pageUrl = tab?.url;
  if (!pageUrl) return;

  const assetId = extractAssetIdFromUrl(pageUrl);
  if (!assetId) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('error.html?reason=no-asset-id') });
    return;
  }

  const settings = await chrome.storage.sync.get({
    helperUrl: DEFAULT_HELPER_URL,
    viewerToken: '',
  });
  const helperUrl = normalizeHelperUrl(settings.helperUrl);
  const viewerToken = typeof settings.viewerToken === 'string' ? settings.viewerToken.trim() : '';
  const tokenQuery = viewerToken ? `?token=${encodeURIComponent(viewerToken)}` : '';
  await chrome.tabs.create({ url: `${helperUrl}/view/${assetId}${tokenQuery}` });
});
