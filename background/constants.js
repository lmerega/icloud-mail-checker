// Central place for every Zoho detail. Uses the official, documented Zoho Mail REST API
// (https://www.zoho.com/mail/help/api/) with OAuth 2.0 and the user's own API Console client.

// Zoho data centers. The Mail API host is the accounts host with "mail." instead of "accounts.".
export const REGIONS = {
  eu: { label: 'Europe (zoho.eu)', accounts: 'https://accounts.zoho.eu', console: 'https://api-console.zoho.eu' },
  com: { label: 'United States (zoho.com)', accounts: 'https://accounts.zoho.com', console: 'https://api-console.zoho.com' },
  in: { label: 'India (zoho.in)', accounts: 'https://accounts.zoho.in', console: 'https://api-console.zoho.in' },
  au: { label: 'Australia (zoho.com.au)', accounts: 'https://accounts.zoho.com.au', console: 'https://api-console.zoho.com.au' },
  jp: { label: 'Japan (zoho.jp)', accounts: 'https://accounts.zoho.jp', console: 'https://api-console.zoho.jp' },
  ca: { label: 'Canada (zohocloud.ca)', accounts: 'https://accounts.zohocloud.ca', console: 'https://api-console.zohocloud.ca' },
  sa: { label: 'Saudi Arabia (zoho.sa)', accounts: 'https://accounts.zoho.sa', console: 'https://api-console.zoho.sa' },
  uk: { label: 'United Kingdom (zoho.uk)', accounts: 'https://accounts.zoho.uk', console: 'https://api-console.zoho.uk' },
  cn: { label: 'China (zoho.com.cn)', accounts: 'https://accounts.zoho.com.cn', console: 'https://api-console.zoho.com.cn' }
};

export const ACCOUNTS_HOST = /^https:\/\/accounts\.(zoho\.(com|eu|in|com\.au|jp|sa|uk|com\.cn)|zohocloud\.ca)$/;
export const MAIL_HOST = /^https:\/\/mail\.(zoho\.(com|eu|in|com\.au|jp|sa|uk|com\.cn)|zohocloud\.ca)\//;

// Read + write: list, read, flag, move, delete, send, empty trash.
export const SCOPES = 'ZohoMail.accounts.READ,ZohoMail.folders.ALL,ZohoMail.messages.ALL';

// Folder tabs of the popup are roles; the real Zoho folder ids are resolved at runtime.
export const FOLDERS = {
  inbox: 'inbox',
  archive: 'archive',
  trash: 'trash',
  sent: 'sent'
};

export const DEFAULTS = {
  pollMinutes: 1,
  notifications: true,
  badge: true,
  sound: true,
  soundId: 'ding',
  theme: 'auto'
};
