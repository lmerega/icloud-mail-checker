# iCloud Mail Checker

Unofficial, free and open-source Chrome (Manifest V3) extension to check and
manage iCloud Mail from the toolbar. Sister project of
[proton-mail-checker](https://github.com/lmerega/proton-mail-checker).

> Independent community project, not affiliated with or endorsed by Apple Inc.
> iCloud and Apple are trademarks of their respective owner.

## Features

- Unread badge, desktop notifications and a "new mail" sound (six to choose from).
- Material-style popup (light, dark or automatic): account row with unread count, folders, search, open in a tab.
- Read whole conversations (remote images and trackers blocked), previous/next message navigation.
- Mark read/unread, star, archive, delete and empty the trash.
- Reply in HTML to HTML mail with an inline editor, or write a new message.
- Verification-code detection with one-click copy.
- Open iCloud Mail from the toolbar, a shortcut (Alt+Shift+M) or a notification.
- Settings export/import (preferences only). English and Italian.

## How it works

Apple offers no public iCloud Mail API. The extension reuses the session you
already have open at <https://www.icloud.com> (cookies, including 2FA trust)
and calls the same web endpoints as the iCloud web app. No password is ever
asked for or stored, and no data passes through a server of this project.

**Limits**

- The endpoints are private and undocumented: Apple can change them without notice. Everything
  is isolated in `background/icloud-api.js` and `background/constants.js`.
- One iCloud session per Chrome profile (cookies), so one account at a time.
- iCloud does not push mail to extensions (and extensions cannot use IMAP), so the extension
  checks at an interval you choose (30 seconds to 30 minutes) with a very light request.
- Attachment download and sending attachments are not available yet.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** and pick the repository root.
4. Sign in at icloud.com, then open the extension popup.

## Development

```
npm test
```

Use synthetic data and `.invalid` domains in tests; never commit credentials
or real mail.

## License

MIT
