# Chrome Web Store listing

## Name
iCloud Mail Checker
(Risk: Apple may object to "iCloud" in the name. Fallback: "Mail Checker for iCloud" with the
non-affiliation disclaimer below.)

## Category
Productivity

## Summary (max 132 characters)
EN: Check and manage your iCloud Mail from the toolbar: unread badge, notifications, search, read and reply.
IT: Controlla e gestisci iCloud Mail dalla barra: badge non letti, notifiche, ricerca, lettura e risposta.

## Description (EN)
iCloud Mail Checker puts your iCloud Mail in the Chrome toolbar.

* Unread badge and optional desktop notifications
* Inbox, Archive, Sent and Trash with search
* Read whole conversations, with remote images and trackers blocked
* Mark read/unread, star, archive and delete from the popup or with hover buttons
* Reply in HTML to HTML mail, or write a new message
* Verification codes detected and copied in one click
* Light and dark theme, English and Italian, settings export/import

No password is requested or stored: sign in once at icloud.com and the extension uses that
session. Mail goes only between your browser and Apple; the developer receives nothing.

Unofficial and independent. Not affiliated with, endorsed or sponsored by Apple Inc.
iCloud is a trademark of Apple Inc. Open source (MIT): github.com/lmerega/icloud-mail-checker

## Description (IT)
iCloud Mail Checker porta iCloud Mail nella barra di Chrome.

* Badge dei non letti e notifiche desktop facoltative
* Posta, Archivio, Inviata e Cestino con ricerca
* Conversazioni complete, con immagini remote e tracker bloccati
* Segna letto/non letto, preferiti, archivia ed elimina dal popup o con i pulsanti al passaggio del mouse
* Risposte in HTML alle mail HTML, o nuovo messaggio
* Codici di verifica riconosciuti e copiati con un clic
* Tema chiaro e scuro, italiano e inglese, esporta/importa impostazioni

Nessuna password richiesta o salvata: accedi una volta a icloud.com e l'estensione usa quella
sessione. La posta passa solo tra il tuo browser e Apple; lo sviluppatore non riceve nulla.

Non ufficiale e indipendente. Non affiliata né approvata da Apple Inc. iCloud è un marchio di Apple Inc.

## Single purpose
Show and manage the user's iCloud Mail from the browser toolbar.

## Permission justifications
- Host access *.icloud.com: required to read and send mail through the user's own iCloud session.
- storage: preferences and last unread count.
- alarms: periodic mail check (every 1-60 minutes).
- notifications: optional alerts for new mail.
- declarativeNetRequestWithHostAccess: sets Origin/Referer on the extension's requests to icloud.com only.
- Remote code: none.

## Data usage declarations
Collects: none. Personal communications (email) are handled locally and exchanged only with
the user's own mail provider (Apple). Not sold, not used for unrelated purposes, no creditworthiness use.

## Privacy policy URL
https://github.com/lmerega/icloud-mail-checker/blob/master/PRIVACY.md

## Assets still needed
- 1-5 screenshots 1280x800 (or 640x400): inbox list, open message, composer, options (use synthetic data!)
- Small promo tile 440x280 (optional but recommended)
- Store icon 128x128: icons/icon-128.png
