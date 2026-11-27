# iCloud Mail Checker

Unofficial, free and open-source Chrome (Manifest V3) extension to check and
manage iCloud Mail from the toolbar. Sister project of
[proton-mail-checker](https://github.com/lmerega/proton-mail-checker).

> Independent community project, not affiliated with or endorsed by Apple Inc.
> iCloud and Apple are trademarks of their respective owner.

## Features

- Unread badge and desktop notifications.
- Folder views (inbox, archive, sent, trash) with sender, subject and preview.
- Verification-code detection with one-click copy.
- Open any message in iCloud Mail with one click.
- Settings export/import (preferences only). English and Italian.

## How it works

Apple offers no public iCloud Mail API. The extension reuses the session you
already have open at <https://www.icloud.com> (cookies, including 2FA trust)
and calls the same web endpoints as the iCloud web app. No password is ever
asked for or stored, and no data passes through a server of this project.

**Limits**

- Those endpoints are private and unverified: method names and payloads live
  in `background/constants.js` and `background/icloud-api.js` and may need
  adjusting against a real session.
- One iCloud session per Chrome profile (cookies), so one account at a time.
- Reading full message bodies, mark read/archive/delete/star and sending are not
  available yet: the web app uses a different internal API for them, still being
  mapped. Those features exist in the code but are hidden until verified.

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
