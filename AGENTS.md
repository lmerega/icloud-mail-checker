# zoho-mail-checker

Maintainer: lmerega. Chrome MV3 extension for Zoho Mail (formerly iCloud Mail Checker, up to 1.0.0),
modeled on proton-mail-checker. All Zoho details are isolated in background/constants.js and
background/zoho-api.js (official Zoho Mail REST API, OAuth with the user's own API Console client).
Run `npm test`. Use synthetic data and .invalid domains; never commit credentials, tokens, cookies
or real mail. No Claude/assistant attribution in commits or PRs.
