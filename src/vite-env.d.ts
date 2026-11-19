/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base URL del bucket immagini (senza slash finale), es. https://img.example.com/cards */
  readonly VITE_IMAGE_BASE_URL?: string
}
