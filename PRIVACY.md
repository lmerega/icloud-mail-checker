# Privacy policy

Last updated: 2026-11-27

iCloud Mail Checker is an unofficial extension that shows your iCloud Mail in the
browser toolbar. It is not affiliated with or endorsed by Apple Inc.

## What the extension does with your data

- **Mail content** (sender, subject, body, attachment names) is requested directly from
  Apple's iCloud servers using the session you already have open at icloud.com. It is
  displayed locally and is never sent to the developer or to any third party.
- **Replies and new messages** you write are sent to Apple's iCloud servers only.
- **No account credentials** are asked for, read or stored. The extension relies on your
  existing icloud.com browser session.
- **Stored locally in your browser:** your iCloud address and the unread count
  (chrome.storage.local), and your preferences (check interval, notifications, badge) in
  chrome.storage.sync, which Chrome may sync across your own devices.
- **Remote content** in emails (images, trackers, scripts) is blocked.

## What the extension does not do

No analytics, no advertising, no telemetry, no tracking, no remote code, and no server
operated by the developer. Data is never sold or shared.

## Permissions

- `https://*.icloud.com/*`: talk to iCloud Mail.
- `storage`: save preferences and the last unread count.
- `alarms`: check for new mail periodically.
- `notifications`: optional desktop notifications for new mail.
- `offscreen`: play the optional "new mail" sound (service workers cannot play audio). No audio is recorded or captured.
- `declarativeNetRequestWithHostAccess`: set the Origin/Referer headers iCloud expects on
  the extension's own requests to icloud.com.

## Contact

Open an issue at https://github.com/lmerega/icloud-mail-checker/issues
