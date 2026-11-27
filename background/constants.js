// Central place for every iCloud web endpoint detail.
// PARTLY VERIFIED (2026-11-27, icloud.com mail2 bundle 2642Hotfix89): paths wm/folder, wm/message,
// wm/messagepart exist and are POSTed with {method, params}; folder ids are "folder:<name>".
// Newer mailws2/v1 endpoints (queryThreads, labels) also exist. Method params still UNVERIFIED: iCloud Mail has no public API. These values mirror what the
// icloud.com web app is believed to use and may change without notice.
// If something breaks, fix it here and in icloud-api.js only.
export const SETUP_URL = 'https://setup.icloud.com/setup/ws/1/validate';
export const WEB_ORIGIN = 'https://www.icloud.com';
export const CLIENT = {
  clientBuildNumber: '2420Project37',
  clientMasteringNumber: '2420B20'
};
export const FOLDERS = {
  inbox: 'INBOX',
  archive: 'Archive',
  trash: 'Deleted Messages',
  sent: 'Sent Messages'
};
export const DEFAULTS = {
  pollMinutes: 1,
  notifications: true,
  badge: true,
  theme: 'auto'
};
