# Zoho Mail Checker

Unofficial, free and open-source Chrome (Manifest V3) extension to check and
manage Zoho Mail from the toolbar. Formerly *iCloud Mail Checker* (up to 1.0.0):
same interface and features, now on the official Zoho Mail API. Sister project of
[proton-mail-checker](https://github.com/lmerega/proton-mail-checker).

> Independent community project, not affiliated with or endorsed by Zoho Corporation.
> Zoho is a trademark of its respective owner.

## Features

- Unread badge, desktop notifications and a "new mail" sound (six to choose from).
- Material-style popup (light, dark or automatic): account row with unread count, folders, search, open in a tab.
- Read messages (remote images and trackers blocked), previous/next message navigation.
- Mark read/unread, star (Zoho "important" flag), archive, delete and empty the trash.
- Reply in HTML to HTML mail with an inline editor, or write a new message.
- Verification-code detection with one-click copy.
- Open Zoho Mail from the toolbar, a shortcut (Alt+Shift+M) or a notification.
- Settings export/import (preferences only). English and Italian.

## How it works

The extension uses the official, documented [Zoho Mail REST API](https://www.zoho.com/mail/help/api/)
with OAuth 2.0 and **your own** OAuth client from the Zoho API Console. Sign-in happens on
Zoho's consent page (`chrome.identity.launchWebAuthFlow`). The refresh token, Client ID and
Client Secret are stored only in this browser (`chrome.storage.local`) and are sent only to
Zoho. No data passes through a server of this project.

Scopes: `ZohoMail.accounts.READ`, `ZohoMail.folders.ALL`, `ZohoMail.messages.ALL`.

**Limits**

- Zoho does not push mail to extensions (and extensions cannot use IMAP), so the extension
  checks at an interval you choose (30 seconds to 30 minutes) with a light request.
- Messages are shown one by one, not grouped into conversations.
- Archive moves messages to a folder named "Archive" (created on first use if missing).
- Attachment download and sending attachments are not available yet.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** and pick the repository root.

The manifest carries a fixed public `key`, so the extension ID is always
`chcbjlpfjoelgihmhdcbnfehgbfopcfe` and the OAuth redirect URI is:

```
https://chcbjlpfjoelgihmhdcbnfehgbfopcfe.chromiumapp.org/zoho
```

The Chrome Web Store build has a different ID (the store assigns it), hence a different redirect
URI: the options page always shows the right one for the installed copy. One Zoho client can list
both URIs.

## Connect your Zoho account (once)

1. Open the API Console of your data center, e.g. <https://api-console.zoho.eu> (Europe).
2. **Add Client** → **Server-based Applications**. Any name; Homepage URL e.g. `https://mail.zoho.eu`;
   Authorized Redirect URI exactly the one above.
3. Copy Client ID and Client Secret into the extension options (**Zoho account** card), choose the
   data center and press **Connect to Zoho**.

**Disconnect** revokes the token on Zoho; Client ID and Secret stay saved for reconnecting.

## Development

```
npm test
```

`test/zoho.test.mjs` runs the service worker against a fake `chrome` API and a fake Zoho server.
Use synthetic data and `.invalid` domains in tests; never commit credentials, tokens or real mail.

## Release (Chrome Web Store)

```
npm run pack                        # dist/zoho-mail-checker-<version>.zip, manifest key removed
node design/make-store-assets.mjs   # store/assets screenshots and promo tiles (synthetic data)
```

Listing texts, permission justifications and the submission checklist are in `store/`.

## License

MIT
