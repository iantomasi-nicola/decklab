# Worker immagini (Cloudflare)

Serve le immagini delle carte dal nostro bucket R2. Se un'immagine manca, la scarica **una sola volta** da YGOPRODeck (solo lato Worker: il sito sorgente vieta l'hotlink dal browser), la salva in R2 e da quel momento la serve da R2.

## Rotte
- `GET /small/{id}.jpg` (anche `.webp`, solo se attivi il binding `IMAGES`, vedi `wrangler.toml`)
- `GET /full/{id}.jpg`
- `GET /cropped/{id}.jpg`

`id` deve essere numerico (passcode della carta). Carta inesistente: 404. Sorgente in errore: 502 (non viene memorizzato, si riprova).
Risposte con `Access-Control-Allow-Origin` (serve per canvas/video) e `Cache-Control: public, max-age=31536000, immutable`.

## Sicurezza e limiti
- `ALLOWED_ORIGINS` (in `wrangler.toml`): elenco di origini consentite, separate da virgola. Una richiesta con `Origin` diverso riceve 403.
- Nessuna chiave o segreto nel codice.
- Verso YGOPRODeck: una richiesta ogni 100 ms per istanza (circa 10 al secondo, sotto il limite di 20) con retry e attesa crescente su 429/5xx. Il limite è per istanza del Worker, non globale: per uso personale basta, perché R2 fa da cache e il traffico verso la sorgente è minimo. Se un giorno servisse un limite globale rigido, si aggiunge un Durable Object.

## Comandi
```
cd workers/images
npx wrangler login
npx wrangler r2 bucket create decklab-images
npx wrangler deploy
npx vitest run workers      # dalla radice del progetto: test con R2/fetch finti
```
Dopo il deploy ottieni un indirizzo `https://decklab-images.<tuo-account>.workers.dev`: è il valore di `VITE_IMAGE_BASE_URL` (senza slash finale). Guida completa: `docs/DEPLOY.md`.
