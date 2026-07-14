# 🎟️ Bolão da Copa 2026

Bolão de família (3 pessoas) das **semifinais + final** da Copa 2026.
Roda 100% no navegador, sem build e sem framework. Agora com **sincronização
em tempo real entre celulares** via Firebase Realtime Database: cada um palpita
no seu aparelho e todos veem o placar atualizar junto.

## Como abrir

Basta abrir o arquivo **`index.html`** direto no navegador:

- **Windows:** dê duplo-clique em `index.html`, ou arraste ele para uma aba do Chrome.
- Ou clique com o botão direito → *Abrir com* → seu navegador.

Não precisa de servidor. **Precisa de internet** (para o Firebase e as fontes)
e do arquivo **`firebase-config.js`** ao lado do `index.html`. Sem internet, o
app mostra "Sem conexão — verifique sua internet e recarregue" em vez de abrir.

> As fontes (Bebas Neue, Space Mono, Inter) vêm do Google Fonts; se faltarem,
> o app cai no fallback do sistema e funciona igual.

## Publicação (GitHub Pages) e o `firebase-config.js`

Este projeto é publicado como **site estático no GitHub Pages**. Site estático
não tem etapa de build nem "variáveis de ambiente": o `firebase-config.js`
precisa existir, com valores reais, **ao lado do `index.html` no repositório
publicado** — senão o site no ar não abre.

Por isso, **o `firebase-config.js` real é versionado no git** (há uma exceção
explícita no `.gitignore`). Isso é uma escolha consciente:

- As chaves do Firebase para web **não são segredo** — ficam expostas no
  navegador de qualquer visitante de qualquer forma.
- A segurança real vem das **regras do Realtime Database** (abaixo), não de
  esconder a `apiKey`.
- Sendo um bolão de família, sem dados sensíveis, versionar a config é aceitável.

Existe também um **`firebase-config.example.js`** (modelo com placeholders). Se
um dia for reaproveitar este código em outro projeto Firebase, copie o modelo
para `firebase-config.js` e troque pelos valores do seu projeto (Console do
Firebase → Configurações do projeto → Seus apps → Config).

No painel do Firebase é preciso ter: **Realtime Database** + **Authentication
anônima** habilitados, e as regras abaixo publicadas (escrita por subárvore, para
dois jogadores salvando ao mesmo tempo não se sobrescreverem):

```json
{
  "rules": {
    "bolao": {
      ".read": true,
      "players": { ".write": "auth != null" },
      "picks":   { "$playerId": { ".write": "auth != null" } },
      "results": { ".write": "auth != null" }
    }
  }
}
```

## Como funciona

1. **Entrada:** digite seu nome e toque em *Entrar e palpitar*. Quem já
   entrou aparece numa lista (sincronizada) para retomar com um toque. O
   aparelho lembra quem é você.
2. **Palpites:** placar de cada semifinal (botões − / +), quem avança,
   campeão da Copa e artilheiro. *Travar palpites das semis* quando estiver
   tudo pronto (dá para destravar). A **Final** abre depois que os dois
   resultados das semis forem lançados.
3. **Resultados:** qualquer jogador lança aqui o placar real, quem
   avançou/quem foi campeão e o artilheiro real.
4. **Placar:** ranking por pontos, com 👑 no líder. Toque numa linha para
   ver o detalhamento (só revela os palpites de um jogo depois que o
   resultado dele foi lançado).

## Regras de pontuação

Por jogo (cada semi e a final):
- **Placar exato** dos 90 min → **5 pts**
- Qualquer outro placar → **0** no quesito placar
- **Acertar quem avança / quem é campeão** → **+3** (vale mesmo se foi nos
  pênaltis — o placar continua sendo o dos 90 min)

Apostas de torneio (feitas antes das semis):
- **Campeão da Copa** → **+5**
- **Artilheiro / chuteira de ouro** → **+5**

Desempate (só no fim, se empatar em pontos):
1. Mais **placares exatos**;
2. Se ainda empatar, **total de gols** do palpite mais próximo do total real;
3. Se ainda empatar, fica **empate** mesmo.

## Estrutura

```
index.html                  página + camada Firebase (módulo inline, SDK v9 via CDN)
style.css                   tema "cupom de aposta" (mobile-first ~380px)
app.js                      lógica de UI, pontuação e persistência
firebase-config.js          config do Firebase (versionada — necessária p/ GitHub Pages)
firebase-config.example.js  modelo com placeholders (p/ reaproveitar em outro projeto)
```

Toda a persistência está isolada no topo do `app.js`:
- **Leitura:** um listener `onValue` no nó `bolao` re-renderiza a UI sempre
  que qualquer dado muda (inclusive por outro aparelho).
- **Escrita:** sempre por caminho específico — `bolao/players/{id}`,
  `bolao/picks/{id}`, `bolao/results/{jogo}` — nunca sobrescrevendo o nó
  `bolao` inteiro. Só "quem sou eu neste aparelho" continua em `localStorage`.

Se o Firebase perder conexão, aparece um selo discreto "sincronizando…" e a UI
volta ao normal ao reconectar (sem travar nem mostrar dado corrompido).

## Teste manual (dois aparelhos / duas abas)

1. Abra o app em **duas abas** (ou dois celulares). Cada um pega uma identidade
   anônima do Firebase automaticamente.
2. Em cada aba, crie um jogador com nome diferente. Confirme que os **dois nomes
   aparecem na lista "JÁ ENTRARAM"** nas duas abas, **sem recarregar** a página.
3. Numa aba, faça um palpite (ex.: quem avança na Semifinal 1). Na outra aba, vá
   no **Placar** e abra o detalhamento desse jogador: enquanto o resultado não
   for lançado, deve aparecer **"aguardando resultado"** (o palpite fica
   escondido dos outros — comportamento que já existia, agora sobrevivendo à
   sincronização).
4. Numa aba, vá em **Resultados**, lance o placar da Semifinal 1 e marque como
   lançado. Na outra aba o placar/pontos atualizam **na hora**, e aí sim o
   palpite do passo 3 é revelado com os pontos.

> Dica: em duas abas do **mesmo** navegador, o "quem sou eu neste aparelho" é
> compartilhado (mesmo `localStorage`), então as duas abas viram o mesmo
> jogador. Para simular dois jogadores de verdade, use dois aparelhos, dois
> navegadores, ou uma aba anônima.

## Autoteste de pontuação

Ao abrir o app, um autoteste roda no **console** do navegador (F12) e imprime
`🎟️ Autoteste do bolão: TODOS PASSARAM`. Para rodar de novo: `bolaoSelfTest()`.
