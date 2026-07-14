/* ============================================================================
   MODELO da config do Firebase (client-side).

   Copie este arquivo para `firebase-config.js` (mesma pasta) e troque os
   placeholders pelos valores reais do SEU projeto Firebase
   (Console do Firebase → Configurações do projeto → Seus apps → Config).

   Observação sobre segredo: as chaves do Firebase para web NÃO são segredo de
   verdade — ficam expostas no navegador de qualquer visitante. A segurança real
   vem das REGRAS do Realtime Database (ver README.md), não de esconder a apiKey.

   Carregado como <script> clássico (não módulo), por isso publica a config
   como uma global em window — assim o app funciona abrindo o index.html
   direto do arquivo, sem servidor.
   ============================================================================ */
window.firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
