/**
 * Store details shown at the top of every printed and digital receipt.
 * Saved to localStorage so changes made in the Store / Printer Settings panel persist.
 */
const SETTINGS_KEY = 'retailhub_store_settings';

export const DEFAULT_STORE_SETTINGS = {
  storeName: 'mainplaz',
  storeAddress: '123 Retail Lane',
  storePhone: '+234-905-576-8474',
  storeEmail: 'support@mainplaz.com',
  storeWebsite: 'mainplaz.com',
  footerText: 'Thanks for your patronage!\nPlease come again.',
};

export function loadStoreSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    stored = {};
  }
  // Replace the old wording in previously saved footer text
  if (stored.footerText) {
    stored.footerText = stored.footerText.replace(/your purchase/gi, 'your patronage');
  }
  // Fill in any detail that was never saved, so receipts always show the store info
  const merged = { ...stored };
  Object.entries(DEFAULT_STORE_SETTINGS).forEach(([key, value]) => {
    if (!merged[key]) merged[key] = value;
  });
  return merged;
}

export function saveStoreSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}