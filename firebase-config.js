/* ============================================================================
   Config do Firebase (client-side).
   As chaves do Firebase para web NÃO são segredo de verdade (ficam expostas
   no navegador de qualquer forma), mas por boa prática este arquivo fica FORA
   do git (veja o .gitignore). Ao clonar o projeto em outro lugar, recrie este
   arquivo — o modelo está comentado no README.md.

   Carregado como <script> clássico (não módulo), por isso publica a config
   como uma global em window — assim o app funciona abrindo o index.html
   direto do arquivo, sem servidor.
   ============================================================================ */
window.firebaseConfig = {
  apiKey: "AIzaSyAGqMAqAWSne3gFhAhab0qhnZumYnZ74K4",
  authDomain: "bolao-c623a.firebaseapp.com",
  databaseURL: "https://bolao-c623a-default-rtdb.firebaseio.com",
  projectId: "bolao-c623a",
  storageBucket: "bolao-c623a.firebasestorage.app",
  messagingSenderId: "934413184169",
  appId: "1:934413184169:web:3aa87dddf9951125e2cdb8"
};
