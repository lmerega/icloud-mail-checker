# Chrome Web Store - campi da incollare

Ordine come nel dashboard. Ogni blocco va copiato intero.

## 1. Pacchetto
File da caricare: dist/icloud-mail-checker.zip (genera con: npm run pack)

## 2. Scheda dello store

Lingua predefinita: English. Poi "Aggiungi lingua" -> Italiano.

Titolo e riepilogo NON si compilano: il dashboard li legge dal pacchetto
(manifest + _locales, campi appName e appDescription, max 132 caratteri).
Si compila: Descrizione (da store/listing.md), Categoria, icona, screenshot.

Categoria: Produttivita (Productivity)
Icona dello store: icons/icon-128.png
Screenshot e riquadri: gia pronti in store/assets (rigenerabili con: node design/make-store-assets.mjs)

## 3. Privacy

Scopo unico:
```
Show and manage the user's iCloud Mail from the browser toolbar.
```

Giustificazione host (*.icloud.com):
```
Required to read and send mail through the user's own iCloud session. No other site is accessed.
```

Giustificazione storage:
```
Saves user preferences and the last unread count.
```

Giustificazione alarms:
```
Periodic mail check (every 1 to 60 minutes, user setting).
```

Giustificazione notifications:
```
Optional desktop alerts for new mail.
```

Giustificazione declarativeNetRequestWithHostAccess:
```
Sets the Origin and Referer headers on the extension's own requests to icloud.com, which the iCloud web service requires. Applies only to icloud.com and only to this extension's requests.
```

Codice remoto: No, non uso codice remoto.

Dati raccolti: spunta "Comunicazioni personali" (la posta e' gestita solo localmente e scambiata con Apple).
Dichiarazioni: non vendo i dati; non li uso per scopi non collegati alla funzione; non li uso per merito creditizio.

URL informativa privacy:
```
https://github.com/lmerega/icloud-mail-checker/blob/master/PRIVACY.md
```

## 4. Descrizione EN
Vedi store/listing.md, sezione "Description (EN)".
## 5. Descrizione IT
Vedi store/listing.md, sezione "Description (IT)".

## Prima di premere "Invia per la revisione"
- Prova invio, archivia, elimina, stella e letto/non letto su una mail che non ti serve.
- Gli screenshot non devono mostrare posta vera.

## Immagini pronte (store/assets)
- Screenshot 1280x800: screenshot-1-list, -2-open, -3-thread, -4-reply, -5-dark (PNG 24 bit, senza trasparenza)
- Riquadro promozionale piccolo 440x280: promo-small-440x280.png
- Riquadro promozionale marquee 1400x560: promo-marquee-1400x560.png
Dati inventati (.invalid), nessuna posta reale.
