# Privacy policy

Last updated: 2026-11-28

Zoho Mail Checker is an unofficial extension that shows your Zoho Mail in the
browser toolbar. It is not affiliated with or endorsed by Zoho Corporation.

## What the extension does with your data

- **Mail content** (sender, subject, body, attachment names) is requested directly from
  Zoho's servers through the official Zoho Mail API. It is displayed locally and is never
  sent to the developer or to any third party.
- **Replies and new messages** you write are sent to Zoho's servers only.
- **Credentials:** you sign in on Zoho's own page; your password is never seen by the
  extension. The OAuth Client ID and Client Secret you enter, and the access/refresh tokens
  Zoho issues, are stored only in this browser (chrome.storage.local) and sent only to Zoho.
- **Stored locally in your browser:** your Zoho address, account id and the unread count
  (chrome.storage.local), and your preferences (check interval, notifications, badge) in
  chrome.storage.sync, which Chrome may sync across your own devices.
- **Remote content** in emails (images, trackers, scripts) is blocked.

## What the extension does not do

No analytics, no advertising, no telemetry, no tracking, no remote code, and no server
operated by the developer. Data is never sold or shared.

## Permissions

- `https://accounts.zoho.*/*`, `https://mail.zoho.*/*` (all Zoho data centers): sign in and talk to Zoho Mail.
- `identity`: open Zoho's sign-in and consent page.
- `storage`: save preferences, tokens and the last unread count.
- `alarms`: check for new mail periodically.
- `notifications`: optional desktop notifications for new mail.
- `offscreen`: play the optional "new mail" sound (service workers cannot play audio). No audio is recorded or captured.

## Contact

Open an issue at https://github.com/lmerega/zoho-mail-checker/issues
