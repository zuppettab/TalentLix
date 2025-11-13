# TalentLix

## Environment configuration

The `/security-check` workflow relies on a dedicated runner service that is proxied by the Next.js API routes under `pages/api/security-check/*`. Configure the following environment variable in **all** environments (local development, preview, and production) so the page can communicate with the service:

- `SECURITY_CHECK_API_BASE_URL`: Base URL of the security check runner service (for example, `https://security-check.example.com`). The API routes append `/run`, `/status`, and `/report` to this value when calling the backend.

For local development you can add the variable to `.env.local`. Hosting providers usually expose a way to define environment variables for preview/staging and production deployments—make sure the same name and value is configured accordingly.

## Motore di invio email

### Configurazione

Il motore SMTP centralizzato vive nell'API route `pages/api/email/send.js` e utilizza le credenziali Aruba fornite. Copia il file `.env.local.example` in `.env.local` (o nelle variabili d'ambiente dell'hosting) per impostare i valori necessari:

```
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_SENDER=no-reply@talentlix.com
EMAIL_SMTP_PASSWORD=010405VegaLix..!
EMAIL_DISPATCHER_PASSWORD=010405Lev..!
NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD=010405Lev..!
```

> `NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD` viene esposto al client così che le pagine possano autenticarsi verso il motore.

⚠️ **Importante:** imposta sempre **entrambi** i valori `EMAIL_DISPATCHER_PASSWORD` e `NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD` con la stessa stringa. Se uno dei due manca (o i valori non coincidono) le chiamate dal browser a `/api/email/send` verranno rifiutate con errore 401 e nessuna mail verrà inviata.

### Endpoint server

Esegui una chiamata `POST` a `/api/email/send` con corpo JSON:

```json
{
  "password": "010405Lev..!",
  "to": ["destinatario@example.com"],
  "subject": "Oggetto della mail",
  "message": "Corpo della mail con paragrafi separati da righe vuote",
  "heading": "Titolo opzionale visibile nel riquadro",
  "previewText": "Testo opzionale mostrato dai client nelle anteprime"
}
```

- `password` deve corrispondere a `EMAIL_DISPATCHER_PASSWORD`.
- `to` accetta una stringa singola, una lista di stringhe o una stringa con indirizzi separati da virgola (max 20 destinatari).
- `message` può essere una stringa o un array di paragrafi; i ritorni a capo vengono formattati automaticamente nel template HTML.
- `heading` e `previewText` sono facoltativi; se omessi viene utilizzato il branding di default "TalentLix".

Il motore produce una mail responsive con palette TalentLix e allega automaticamente una versione testuale del messaggio.

### Helper client

Per evitare duplicazioni è disponibile `utils/emailDispatcher.js`:

```js
import { sendEmail } from '@/utils/emailDispatcher';

await sendEmail({
  to: 'destinatario@example.com',
  subject: 'Nuovo aggiornamento',
  message: [
    'Ciao Mario,',
    'La tua candidatura è stata aggiornata e ora è in revisione.',
    'Accedi alla piattaforma per maggiori dettagli.'
  ],
  heading: 'TalentLix - Aggiornamento candidatura',
  previewText: 'La tua candidatura è ora in revisione.'
});
```

Il helper converte automaticamente gli array di paragrafi in testo con separatori a doppia riga e gestisce eventuali errori sollevando eccezioni con un messaggio leggibile.
