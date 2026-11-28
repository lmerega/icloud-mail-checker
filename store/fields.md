# Chrome Web Store - campi da incollare

Ordine come nel dashboard (https://chrome.google.com/webstore/devconsole). Ogni blocco va copiato intero.

## 0. Nuovo elemento o aggiornamento della scheda iCloud?

Consigliato: **nuovo elemento** ("Nuovo elemento" nel dashboard). La scheda esistente si chiama
iCloud Mail Checker: aggiornarla trasformerebbe in silenzio l'estensione degli utenti iCloud in
un'estensione per Zoho, e il revisore la vedrebbe come cambio di scopo. La scheda iCloud va
ritirata a parte (Distribuzione -> Visibilità: Non in elenco o "Annulla pubblicazione").

## Elemento sullo store

- ID elemento: `noinmagpdmciljliepmffbcckfmjjpbo`
- Redirect URI della versione dello store (da aggiungere al client nella Zoho API Console):
  `https://noinmagpdmciljliepmffbcckfmjjpbo.chromiumapp.org/zoho`
- 2026-11-28, primo invio rifiutato per "Spam di parole chiave" (Yellow Argon): la descrizione
  elencava tutti i domini dei data center Zoho. Corretto togliendo l'elenco e riducendo le
  ripetizioni di "Zoho". Niente elenchi di domini, marchi o parole chiave nelle descrizioni.

## 1. Pacchetto

```
npm run pack
```
crea `dist/zoho-mail-checker-<versione>.zip` (solo file dell'estensione, rifiuta di partire con
modifiche non committate). Lo script toglie dal manifest il campo `key`: serve solo a fissare
l'ID della versione caricata da cartella; lo store assegna un ID suo.

Attenzione: con l'ID dello store cambia anche il redirect URI OAuth. Dopo la pubblicazione,
installa dallo store, apri le Opzioni e aggiungi il redirect URI mostrato lì (stesso formato,
`https://<ID-store>.chromiumapp.org/zoho`) al client nella Zoho API Console, accanto a quello
di sviluppo (il "+" accanto al campo). Ogni utente fa lo stesso con il proprio client: la guida
nelle Opzioni mostra sempre l'URI giusto.

## 2. Scheda dello store

Lingua predefinita: English. Poi "Aggiungi lingua" -> Italiano.

Titolo e riepilogo NON si compilano: il dashboard li legge dal pacchetto
(manifest + _locales, campi appName e appDescription, max 132 caratteri).

- Descrizione EN: `store/description-en.txt`
- Descrizione IT: `store/description-it.txt`
- Categoria: Produttività (Productivity)
- Icona dello store 128x128: `store/assets/store-icon-128.png` (disegno 96x96 con 16 px di margine
  trasparente, come chiede Google; `icons/icon-128.png` è a tutto riquadro e nello store sembrerebbe più grande)
- Screenshot 1280x800: `store/assets/screenshot-1-list.png` ... `screenshot-5-dark.png`
- Riquadro promozionale piccolo 440x280: `store/assets/promo-small-440x280.png`
- Riquadro marquee 1400x560: `store/assets/promo-marquee-1400x560.png`
- Sito web: `https://github.com/lmerega/zoho-mail-checker`
- URL assistenza: `https://github.com/lmerega/zoho-mail-checker/issues`

Immagini rigenerabili con `node design/make-store-assets.mjs` (dati inventati, domini .invalid,
nessuna posta reale; PNG 24 bit senza trasparenza come chiede lo store).

Rischio marchio: "Zoho" nel nome. Descrizione e README dichiarano che è non ufficiale e non
affiliata. Se lo store o Zoho obiettano, ripiego: "Mail Checker for Zoho Mail".

## 3. Privacy

Scopo unico:
```
Show and manage the user's Zoho Mail from the browser toolbar.
```

Giustificazione host (accounts.zoho.* e mail.zoho.* di tutti i data center):
```
Required to sign in with Zoho OAuth (accounts.zoho.*) and to read and send the user's mail through the official Zoho Mail API (mail.zoho.*). One pair of hosts per Zoho data center, because the account may live in any of them. No other site is accessed.
```

Giustificazione identity:
```
Opens Zoho's own sign-in and consent page (chrome.identity.launchWebAuthFlow) to obtain the OAuth authorization for the user's Zoho Mail account. The extension never sees the user's password.
```

Giustificazione storage:
```
Saves user preferences, the user's own OAuth client ID/secret and tokens (locally only), and the last unread count.
```

Giustificazione alarms:
```
Periodic mail check (every 30 seconds to 30 minutes, user setting).
```

Giustificazione notifications:
```
Optional desktop alerts for new mail.
```

Giustificazione offscreen:
```
Plays an optional sound when new mail arrives. Service workers cannot play audio, so a hidden offscreen page (reason AUDIO_PLAYBACK) plays a short synthesized tone. Nothing is recorded or captured.
```

Codice remoto: No, non uso codice remoto.

Dati raccolti: spunta "Comunicazioni personali" (la posta, letta e inviata) e
"Informazioni di autenticazione" (token OAuth). Entrambi restano nel browser e passano solo
tra il browser e Zoho; lo sviluppatore non riceve nulla.
Dichiarazioni: non vendo i dati; non li uso per scopi non collegati alla funzione; non li uso
per merito creditizio.

URL informativa privacy:
```
https://github.com/lmerega/zoho-mail-checker/blob/master/PRIVACY.md
```
(funziona dopo il push del commit che contiene la nuova PRIVACY.md)

## 4. Istruzioni per il revisore (Test instructions)

Il revisore deve poter collegare un account. Crea un account Zoho Mail di prova (gratuito) e
un client nella API Console, poi incolla nel campo "Test instructions" del dashboard:
```
1. Open the extension options (right-click the toolbar icon > Options).
2. In "Zoho account" choose data center "<DC>", paste Client ID "<...>" and Client Secret "<...>".
3. Press "Connect to Zoho" and sign in with the test account <email> / <password>.
4. Open the popup: unread badge, folders, search, read, star, archive, delete and reply work on that mailbox.
```
Le credenziali del test vanno scritte solo lì, mai nel repository. Ricorda di aggiungere al
client di prova anche il redirect URI con l'ID dello store (punto 1).

## Prima di premere "Invia per la revisione"
- Prova su una mailbox reale: invio, archivia, elimina, stella, letto/non letto, svuota cestino.
- `npm test` verde, commit e push fatti, `npm run pack` senza `--allow-dirty`.
- Gli screenshot non devono mostrare posta vera.
