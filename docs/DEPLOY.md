# Guida al deploy (per chi non è tecnico)

Obiettivo: mettere Combo Lab online (Cloudflare Pages), con immagini carte (R2 + Worker) e sincronizzazione (Supabase). Tutto con piani gratuiti. Tempo: circa 45 minuti. I nomi dei pulsanti possono cambiare: se non trovi una voce, cerca quella più simile.

**Ordine:** 1 Account, 2 Immagini (R2 + Worker), 3 Supabase, 4 Pages, 5 Collegamenti finali.

## 1. Account Cloudflare
1. Vai su https://dash.cloudflare.com/sign-up, inserisci email e password, conferma l'email.
2. Nessuna carta è richiesta per Pages e Workers. Per **R2** Cloudflare può chiedere una carta per attivarlo: resta gratis entro i limiti (vedi "Costi").

## 2. Immagini: bucket R2 e Worker
Serve Node.js 22 sul tuo computer (https://nodejs.org, "LTS") e il progetto scaricato.
1. Apri il terminale nella cartella del progetto.
2. `cd workers/images`
3. `npx wrangler login` : si apre il browser, clicca **Allow**.
4. `npx wrangler r2 bucket create decklab-images`
5. Apri `workers/images/wrangler.toml` e in `ALLOWED_ORIGINS` metti l'indirizzo del tuo sito Pages (lo avrai al passo 4; puoi tornare qui dopo e rifare il deploy). Esempio: `https://decklab.pages.dev`.
6. `npx wrangler deploy`
7. Il terminale mostra un indirizzo tipo `https://decklab-images.TUONOME.workers.dev`. **Copialo**: è il valore di `VITE_IMAGE_BASE_URL`.
8. Prova: apri `<indirizzo>/small/46986414.jpg` nel browser (Dark Magician): deve apparire la carta (la prima volta ci mette un attimo).

Alternativa dalla dashboard: **Storage & databases > R2 > Create bucket** (nome `decklab-images`); **Workers & Pages > Create > Create Worker**, incolla il contenuto di `workers/images/src/index.ts`, poi in **Settings > Bindings** aggiungi un bucket R2 con nome `BUCKET` e in **Variables** `ALLOWED_ORIGINS`. Il terminale è più semplice.

## 3. Supabase (login e sincronizzazione)
1. https://supabase.com > **Start your project** > accedi con GitHub.
2. **New project**: nome `decklab`, scegli una password per il database (salvala), regione vicina (es. Frankfurt), piano **Free**. Attendi la creazione.
3. Menu **SQL Editor > New query**: apri `supabase/migrations/0001_init.sql`, copia tutto, incolla, clicca **Run**. Deve dire "Success".
4. **Authentication > Providers**: **Email** attivo (magic link). Per **Google**: attivalo e segui il link "Callback URL" mostrato, creando le credenziali OAuth su Google Cloud Console (incolla Client ID e Secret). Google è facoltativo.
5. **Project Settings > API**: copia **Project URL** (`VITE_SUPABASE_URL`) e la chiave **anon / public** (`VITE_SUPABASE_ANON_KEY`). **Non copiare mai la chiave `service_role`** da nessuna parte.
6. **Authentication > URL Configuration**: dopo il passo 4, imposta **Site URL** = indirizzo Pages e aggiungi in **Redirect URLs** lo stesso indirizzo (più `http://localhost:5173` se sviluppi in locale).

## 4. Cloudflare Pages
1. Dashboard Cloudflare > **Workers & Pages > Create > Pages > Connect to Git**. Autorizza GitHub e scegli il repository.
2. **Production branch**: `ccr-66bffddf-j9bdnn`.
3. **Build command**: `npm run build`. **Build output directory**: `dist`.
4. **Environment variables** (Production e, se vuoi, Preview):
   - `NODE_VERSION` = `22`
   - `VITE_IMAGE_BASE_URL` = indirizzo del Worker (passo 2.7), senza `/` finale
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chiave anon
5. **Save and Deploy**. Alla fine ottieni `https://NOME.pages.dev`.
6. Torna ai passi 2.5 (ALLOWED_ORIGINS, poi `npx wrangler deploy`) e 3.6 (Redirect URLs) con questo indirizzo.

Le chiavi stanno **solo** nelle variabili d'ambiente di Pages, mai nel codice o su GitHub. La chiave anon è pensata per essere visibile nel browser: la protezione dei dati è nelle regole RLS del database.
Le variabili `VITE_` entrano nell'app al momento della build: dopo averle cambiate fai un nuovo deploy (**Deployments > Retry deployment**).

## 5. Verifica
Apri il sito, cerca una carta: l'immagine deve comparire. Prova il login e crea un mazzo da due dispositivi. I file `public/_headers` (cache) e `public/_redirects` (le pagine interne funzionano al ricaricamento) sono già nel progetto.

## Aggiornare
Ogni push sul branch `ccr-66bffddf-j9bdnn` fa partire un deploy automatico. Controlla l'esito su **Workers & Pages > il tuo progetto > Deployments**. La CI su GitHub (scheda **Actions**) verifica tipi, test e build. Il Worker si aggiorna a mano: `cd workers/images && npx wrangler deploy`. Le modifiche al database (nuovi file in `supabase/migrations`) si incollano nello SQL Editor.

## Tornare indietro
**Pages > Deployments**: sul deploy precedente funzionante clicca **… > Rollback to this deployment**. Worker: **Workers & Pages > decklab-images > Deployments > Rollback**. Database: fai un backup/esporta prima di cambiare lo schema; le migrazioni vanno scritte per essere reversibili.

## Costi (verifica sempre i limiti attuali sui siti ufficiali: cambiano)
- **Cloudflare Pages**: gratuito per progetti personali (build e banda statica generose). Limiti: https://developers.cloudflare.com/pages/platform/limits/
- **Workers**: piano gratuito con un tetto giornaliero di richieste (ordine di 100.000/giorno). https://developers.cloudflare.com/workers/platform/pricing/
- **R2**: spazio gratuito (ordine di 10 GB), uscita dati (egress) senza costo; le operazioni hanno una quota gratuita. https://developers.cloudflare.com/r2/pricing/
- **Supabase Free**: database e login con limiti (ordine di 500 MB di database; i progetti inattivi vengono messi in pausa dopo circa 1 settimana senza uso). https://supabase.com/pricing
Per uso personale restano ampiamente nel gratuito. Imposta, se disponibili, avvisi di spesa.

## Licenze: attenzione se l'app diventa pubblica
- Il core EDOPro (`ocgcore`) e gli script delle carte sono **AGPL-3.0**: se l'app è accessibile ad altri via rete devi offrire loro il **codice sorgente completo**. Uso personale: nessun obbligo.
- Immagini e nomi delle carte sono © Konami: uso personale non commerciale; non ridistribuirle pubblicamente.
- Dati YGOPRODeck: rispetta i loro termini (niente hotlink, massimo 20 richieste/secondo): il Worker lo fa per te.
- Un repository GitHub pubblico o un dominio condiviso con altri rende l'app "pubblica": **avvisami prima**, e vedi docs/ARCHITECTURE.md §13.
