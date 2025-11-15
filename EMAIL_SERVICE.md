# TalentLix Email Service

Questo documento descrive l'infrastruttura introdotta per l'invio centralizzato di email all'interno di TalentLix. Il servizio permette a qualsiasi pagina autenticata di inviare messaggi senza dover ricreare la logica SMTP.

## Panoramica

L'architettura è composta da tre blocchi principali:

1. **API autenticata** (`/api/email/send`): riceve le richieste di invio, valida l'utente tramite Supabase e delega la consegna a Nodemailer.
2. **Servizio server-side** (`utils/emailService.js`): incapsula la configurazione SMTP e la logica di invio.
3. **Client helper** (`utils/emailClient.js`): fornisce una funzione riutilizzabile nel frontend per ottenere il token dell'utente e chiamare l'endpoint.

È inoltre disponibile una pagina di test (`/email-test`) che consente a qualsiasi utente autenticato di verificare rapidamente il funzionamento del servizio.

## Prerequisiti

Configurare i seguenti valori in `.env.local` o nelle variabili d'ambiente del deployment:

```bash
SMTP_HOST=pro.turbo-smtp.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_SENDER=no-reply@talentlix.com
EMAIL_SMTP_USERNAME=439d3cedd6e1b96a3254
EMAIL_SMTP_PASSWORD=087f5dDsQYr9GjS6OzyM
```

> **Nota:** `SMTP_SECURE` accetta `true`/`false` (case insensitive). Il porto viene interpretato come numero.

### Configurazione su Vercel

1. Accedi alla [dashboard di Vercel](https://vercel.com/) e apri il progetto TalentLix.
2. Vai su **Settings → Environment Variables**.
3. Aggiungi le sei variabili indicate sopra (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_SENDER`, `EMAIL_SMTP_USERNAME`, `EMAIL_SMTP_PASSWORD`).
   - Imposta il valore esatto fornito per ciascuna variabile.
   - Seleziona gli ambienti in cui devono essere disponibili (tipicamente **Production**, **Preview** e **Development**).
4. Salva le modifiche e avvia un nuovo deploy (o ri-deploy) del progetto affinché Vercel renda disponibili le variabili alle funzioni serverless di Next.js.

> Le variabili rimangono memorizzate in modo sicuro su Vercel e saranno accessibili dal codice server-side (`process.env`) senza doverle committare nel repository.

## Flusso di autenticazione

1. Il client recupera il token della sessione dall'SDK Supabase (`supabase.auth.getSession()`).
2. L'helper `sendEmailWithSupabase` inserisce l'access token nell'intestazione `Authorization`.
3. L'API `/api/email/send` utilizza `resolveAuthenticatedRequestContext` per verificare il token con Supabase (service role o client delegato).
4. Solo se l'utente è autenticato l'email viene inviata.

Qualsiasi tentativo senza token o con sessione non valida restituisce `401 Unauthorized`.

## Utilizzo nel frontend

```js
import { supabase } from '../utils/supabaseClient';
import { sendEmailWithSupabase } from '../utils/emailClient';

await sendEmailWithSupabase(supabase, {
  to: 'user@example.com',
  subject: 'Benvenuto in TalentLix',
  text: 'Ciao e benvenuto!',
  html: '<p>Ciao e <strong>benvenuto</strong>!</p>', // opzionale
});
```

Per casi particolari (es. token già disponibile) è possibile usare `sendEmailRequest({ accessToken, ...payload })`.

### Campi supportati

- `to` (stringa o array) – obbligatorio
- `subject` – obbligatorio
- `text` / `html` – almeno uno obbligatorio
- `cc`, `bcc`, `replyTo` – opzionali
- `headers` – oggetto opzionale per intestazioni personalizzate

Il servizio aggiunge automaticamente l'header `X-TalentLix-Metadata` con l'ID dell'utente richiedente e il timestamp della richiesta.

## Endpoint API

- Metodo: `POST`
- URL: `/api/email/send`
- Body JSON:

```json
{
  "to": "destinatario@example.com",
  "subject": "Oggetto",
  "text": "Messaggio plain text",
  "html": "<p>Messaggio HTML</p>"
}
```

Risposta (200):

```json
{
  "message": "Email sent successfully.",
  "delivery": {
    "messageId": "...",
    "accepted": ["destinatario@example.com"],
    "rejected": [],
    "response": "250 OK",
    "envelope": { "from": "no-reply@talentlix.com", "to": ["destinatario@example.com"] }
  }
}
```

Gli errori restituiscono `error`, `code` e `details` quando disponibili.

## Pagina di test (`/email-test`)

- Accessibile solo se si è autenticati (atleta o operatore).
- Offre un form con campi per destinatario, oggetto, testo e HTML opzionale.
- Visualizza l'esito dell'invio e permette di ripetere il test.
- Mostra link ai flussi di login se non si possiede una sessione attiva.

## Estensioni future

- Supporto allegati (es. integrando `attachments` nel payload).
- Template HTML riutilizzabili con Handlebars o MJML.
- Tracciamento degli invii su Supabase per auditing.

Per domande o miglioramenti, fare riferimento a questo documento prima di intervenire sul codice.
