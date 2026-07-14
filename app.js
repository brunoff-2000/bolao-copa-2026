'use strict';
/* ============================================================================
   BOLÃO DA COPA 2026 — sincronizado via Firebase Realtime Database
   ----------------------------------------------------------------------------
   >>> CAMADA DE PERSISTÊNCIA <<<
   A leitura é um listener em tempo real (onValue) no nó "bolao": sempre que
   qualquer dado muda — inclusive por outra pessoa em outro celular — chega em
   applyRemoteState() e a UI re-renderiza.

   A escrita é SEMPRE por caminho específico (nunca sobrescreve "bolao" inteiro):
     - jogador   → bolao/players/{playerId}
     - palpite   → bolao/picks/{playerId}   (cada um só na própria subárvore)
     - resultado → bolao/results/{jogo}      (semi1 | semi2 | final | topScorer)
   Assim, dois aparelhos salvando ao mesmo tempo em caminhos diferentes não se
   sobrescrevem.

   O objeto Firebase (initializeApp/auth/onValue/set/remove) mora no módulo
   inline do index.html e é injetado aqui via attachPersistence(). Só "quem sou
   eu neste aparelho" (me) continua em localStorage — é local por aparelho.

   Formato do estado (idêntico à árvore no Firebase):
     { players:{[id]:{id,name}}, picks:{[id]:<pick>}, results:<results> }
   ============================================================================ */

const ME_KEY = 'bolao-copa-2026/me';   // "quem sou eu neste aparelho" (só local)

// Ponte de escrita para o Firebase (injetada pelo módulo do index.html).
// No-op até conectar, para nada quebrar caso um clique chegue cedo demais.
let persist = { set(){}, remove(){} };

function loadMe(){ try{ return localStorage.getItem(ME_KEY) || null; }catch(e){ return null; } }
function saveMe(id){ try{ id ? localStorage.setItem(ME_KEY, id) : localStorage.removeItem(ME_KEY); }catch(e){} }

/* ---------- Escritas por caminho (o coração da sincronização) ----------
   Aceitam um valor explícito porque o Firebase dispara o listener onValue de
   forma SÍNCRONA dentro de set(): se escrevemos duas coisas em sequência (ex.:
   jogador + palpite ao entrar), a 1ª escrita reconstrói "state" no meio do
   caminho, e ler state.* para a 2ª escrita pegaria dado já sobrescrito. Passar
   o valor por parâmetro evita essa corrida. */
function savePlayer(id, player){ persist.set(`bolao/players/${id}`, player || { id, name: state.players[id].name }); }
function savePick(id, pick){ persist.set(`bolao/picks/${id}`, pick || state.picks[id]); } // só a própria subárvore
function saveResultGame(gk){ persist.set(`bolao/results/${gk}`, state.results[gk]); } // semi1 | semi2 | final
function saveResultScorer(){ persist.set(`bolao/results/topScorer`, state.results.topScorer); }
// Reinicia o bolão apagando por subcaminho. As regras publicadas dão permissão
// de escrita em players, results e picks/{id} — NÃO no nó "bolao" inteiro (e a
// permissão não sobe do filho para o pai). Limpar cada subárvore permitida tem
// o mesmo efeito de zerar tudo.
function wipeBolao(){
  const ids = new Set([...Object.keys(state.players), ...Object.keys(state.picks)]);
  ids.forEach(id => persist.remove(`bolao/picks/${id}`));
  persist.remove('bolao/players');
  persist.remove('bolao/results');
}

/* ---------- Normaliza o que vem do RTDB para o formato completo do estado ----------
   O Firebase omite chaves com valor null/objeto vazio, então reconstruímos os
   defaults (advance:null, done:false, home:0, locked:false, ...). */
function fromDb(raw){
  const s = emptyState();
  raw = raw || {};
  for(const [id, p] of Object.entries(raw.players || {})){
    if(p) s.players[id] = { id, name: p.name || '' };
  }
  for(const [id, p] of Object.entries(raw.picks || {})){
    const base = emptyPick();
    if(p){
      for(const gk of ['semi1','semi2','final']) if(p[gk]) Object.assign(base[gk], p[gk]);
      if('champion'  in p) base.champion  = p.champion  ?? null;
      if('topScorer' in p) base.topScorer = p.topScorer ?? null;
      base.locked = !!p.locked;
    }
    s.picks[id] = base;
  }
  const R = raw.results || {};
  for(const gk of ['semi1','semi2','final']) if(R[gk]) Object.assign(s.results[gk], R[gk]);
  if('topScorer' in R) s.results.topScorer = R.topScorer ?? null;
  return s;
}

/* ============================ CONFIGURAÇÃO ============================ */
const TEAMS = {
  franca:     { id:'franca',     name:'França',     flag:'🇫🇷' },
  espanha:    { id:'espanha',    name:'Espanha',    flag:'🇪🇸' },
  inglaterra: { id:'inglaterra', name:'Inglaterra', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  argentina:  { id:'argentina',  name:'Argentina',  flag:'🇦🇷' },
};
const SEMIS = [
  { key:'semi1', label:'Semifinal 1', date:'TER 14/07', home:'franca',     away:'espanha'   },
  { key:'semi2', label:'Semifinal 2', date:'QUA 15/07', home:'inglaterra', away:'argentina' },
];
const FINAL_DATE = 'DOM 19/07';
const CHAMPION_OPTIONS = ['franca','espanha','inglaterra','argentina'];
const SCORERS = [
  { id:'messi',      name:'Messi',      flag:'🇦🇷' },
  { id:'mbappe',     name:'Mbappé',     flag:'🇫🇷' },
  { id:'haaland',    name:'Haaland',    flag:'🇳🇴' },
  { id:'kane',       name:'Kane',       flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id:'dembele',    name:'Dembélé',    flag:'🇫🇷' },
  { id:'bellingham', name:'Bellingham', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
];

// Pontos
const PTS_EXACT = 5;   // placar exato dos 90 minutos
const PTS_ADV   = 3;   // acertar quem avança / quem é campeão (no jogo)
const PTS_CHAMP = 5;   // acertar o campeão da Copa (aposta de torneio)
const PTS_SCORER= 5;   // acertar o artilheiro (aposta de torneio)

/* ============================ FÁBRICAS DE ESTADO ============================ */
function emptyState(){ return { players:{}, picks:{}, results:emptyResults() }; }
function emptyResults(){
  return {
    semi1: { home:0, away:0, advance:null, done:false },
    semi2: { home:0, away:0, advance:null, done:false },
    final: { home:0, away:0, champion:null, done:false },
    topScorer: null,
  };
}
function emptyPick(){
  return {
    semi1: { home:0, away:0, advance:null },
    semi2: { home:0, away:0, advance:null },
    final: { home:0, away:0, champion:null },
    champion:  null,   // aposta de torneio: uma das 4 seleções
    topScorer: null,   // aposta de torneio: um dos 6 jogadores
    locked:    false,  // palpites das semis travados?
  };
}
/* ============================ UTILIDADES ============================ */
function normalizeName(n){
  return (n||'').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'') // remove acentos
    .replace(/\s+/g,' ');
}
function findPlayerByName(name){
  const key = normalizeName(name);
  return Object.values(state.players).find(p => normalizeName(p.name) === key) || null;
}
function newId(){ return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function initials(name){ return (name||'?').trim().charAt(0).toUpperCase(); }
function teamOpt(id){ return TEAMS[id]; }
function clampGoals(n){ return Math.max(0, Math.min(20, n|0)); }
function myPick(){
  if(!me) return emptyPick();
  if(!state.picks[me]) state.picks[me] = emptyPick();
  return state.picks[me];
}

/* Finalistas reais = quem avançou nas duas semis (após lançado). */
function finalistsReady(){
  return !!(state.results.semi1.advance && state.results.semi2.advance);
}
function finalists(){
  return finalistsReady() ? [state.results.semi1.advance, state.results.semi2.advance] : null;
}

/* ============================================================================
   PONTUAÇÃO
   ============================================================================ */
// Placar de um jogo: 5 se acertar exatamente os 90 min; senão 0. Só conta se lançado.
function scorePlacar(pick, res){
  if(!res || !res.done) return { revealed:false, exact:false, pts:0 };
  const exact = (pick.home === res.home) && (pick.away === res.away);
  return { revealed:true, exact, pts: exact ? PTS_EXACT : 0 };
}
// Quem avança / quem é campeão no jogo: +3 se acertar. Independe do placar.
function scoreAdvance(pickAdv, resAdv, revealed){
  if(!revealed || !resAdv) return { revealed:false, correct:false, pts:0 };
  const correct = pickAdv === resAdv;
  return { revealed:true, correct, pts: correct ? PTS_ADV : 0 };
}

/* Detalhamento completo de um jogador (itens + totais + dados de desempate). */
function computePlayer(pid){
  const pick = state.picks[pid] || emptyPick();
  const R = state.results;
  const items = [];
  let total = 0, exactCount = 0;

  // --- Semis e Final (mesma estrutura de item) ---
  const games = [
    { key:'semi1', label:'Semifinal 1', kind:'advance', homeId:SEMIS[0].home, awayId:SEMIS[0].away },
    { key:'semi2', label:'Semifinal 2', kind:'advance', homeId:SEMIS[1].home, awayId:SEMIS[1].away },
    { key:'final', label:'Final',       kind:'champion' },
  ];
  for(const g of games){
    const p = pick[g.key], res = R[g.key];
    const pl = scorePlacar(p, res);
    const isChamp = g.kind === 'champion';
    const adv = scoreAdvance(isChamp ? p.champion : p.advance,
                             isChamp ? res.champion : res.advance,
                             res.done);
    const gpts = pl.pts + adv.pts;
    total += gpts;
    if(pl.exact) exactCount++;

    // nomes dos times: para a final usa os finalistas reais (se houver)
    let homeId = g.homeId, awayId = g.awayId;
    if(isChamp){ const f = finalists(); if(f){ homeId = f[0]; awayId = f[1]; } }

    items.push({
      key:g.key, label:g.label, kind:g.kind,
      revealed: res.done,
      homeId, awayId,
      pickHome:p.home, pickAway:p.away,
      resHome:res.home, resAway:res.away,
      exact:pl.exact, placarPts:pl.pts,
      pickAdv: isChamp ? p.champion : p.advance,
      resAdv:  isChamp ? res.champion : res.advance,
      advCorrect:adv.correct, advPts:adv.pts,
      gpts,
    });
  }

  // --- Aposta de torneio: campeão da Copa (+5) ---
  const champRevealed = R.final.done && !!R.final.champion;
  const champCorrect  = champRevealed && pick.champion === R.final.champion;
  if(champCorrect) total += PTS_CHAMP;
  items.push({
    key:'t_champion', label:'Campeão da Copa', kind:'tournament', tour:'champion',
    revealed:champRevealed, pick:pick.champion, res:R.final.champion,
    correct:champCorrect, pts:champCorrect ? PTS_CHAMP : 0,
  });

  // --- Aposta de torneio: artilheiro (+5) ---
  const scorerRevealed = !!R.topScorer;
  const scorerCorrect  = scorerRevealed && pick.topScorer === R.topScorer;
  if(scorerCorrect) total += PTS_SCORER;
  items.push({
    key:'t_scorer', label:'Artilheiro', kind:'tournament', tour:'scorer',
    revealed:scorerRevealed, pick:pick.topScorer, res:R.topScorer,
    correct:scorerCorrect, pts:scorerCorrect ? PTS_SCORER : 0,
  });

  // --- Dados de desempate ---
  // 2º critério: soma de gols do palpite vs soma de gols reais, nos jogos lançados.
  let pickGoals = 0, realGoals = 0, anyDone = false;
  for(const g of games){
    const res = R[g.key];
    if(res.done){ anyDone = true; pickGoals += pick[g.key].home + pick[g.key].away; realGoals += res.home + res.away; }
  }
  const goalsDiff = anyDone ? Math.abs(pickGoals - realGoals) : null;

  return { pid, name:(state.players[pid]||{}).name || '—', items, total, exactCount, goalsDiff };
}

/* Classificação com desempate:
   1) total desc  2) mais placares exatos  3) menor diferença de gols  4) empate. */
function computeStandings(){
  const rows = Object.keys(state.players).map(computePlayer);
  rows.sort((a,b)=>{
    if(b.total !== a.total) return b.total - a.total;
    if(b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
    const ad = a.goalsDiff==null ? Infinity : a.goalsDiff;
    const bd = b.goalsDiff==null ? Infinity : b.goalsDiff;
    if(ad !== bd) return ad - bd;
    return normalizeName(a.name).localeCompare(normalizeName(b.name));
  });
  // Marca motivo de desempate quando o total empata com algum vizinho.
  for(let i=0;i<rows.length;i++){
    const r = rows[i];
    const tiedWith = rows.filter(x => x.pid!==r.pid && x.total===r.total);
    r.tie = null;
    if(tiedWith.length){
      const betterExact = tiedWith.some(x => x.exactCount !== r.exactCount);
      const aheadExact  = tiedWith.every(x => r.exactCount >= x.exactCount);
      if(betterExact){
        r.tie = 'desempate: mais placares exatos';
      }else{
        const rd = r.goalsDiff==null ? Infinity : r.goalsDiff;
        const diffGoals = tiedWith.some(x => (x.goalsDiff==null?Infinity:x.goalsDiff) !== rd);
        r.tie = diffGoals ? 'desempate: total de gols mais próximo' : 'empate';
      }
    }
  }
  return rows;
}

/* ============================================================================
   RENDER
   ============================================================================ */
let state = emptyState();       // preenchido pelo listener do Firebase (applyRemoteState)
let me = loadMe();
let tab = 'picks';

const $ = sel => document.querySelector(sel);
const gateEl = $('#gate'), appEl = $('#app'), viewEl = $('#view');
const bootEl = $('#boot'), bootMsgEl = $('#bootMsg'), bootRetryEl = $('#bootRetry'),
      bootSpinEl = $('#bootSpin'), syncBadgeEl = $('#syncBadge');
let booted = false;

function render(){
  // Só entra no app se "me" existe E é um jogador conhecido no estado atual.
  // De propósito NÃO apagamos o "me" salvo aqui: assim uma queda de conexão
  // momentânea (snapshot vazio transitório) não desloga ninguém — quando os
  // dados voltam, o app reaparece sozinho. Num "Reiniciar bolão" real o jogador
  // some do estado e a tela de entrada aparece normalmente.
  const showGate = !(me && state.players[me]);
  gateEl.hidden = !showGate;
  appEl.hidden  = showGate;
  if(showGate){ renderGate(); return; }

  $('#whoami').innerHTML =
    `Jogando como <b>${esc(state.players[me].name)}</b> · ` +
    `<button class="btn-link" data-action="switch-player">trocar</button>`;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));

  if(tab==='picks')   renderPicks();
  else if(tab==='results') renderResults();
  else renderScore();
}

/* ---------------------------------- GATE ---------------------------------- */
function renderGate(){
  const players = Object.values(state.players);
  const box = $('#knownPlayers');
  if(!players.length){ box.innerHTML=''; }
  else{
    box.innerHTML = `<div class="known-head mono">JÁ ENTRARAM</div>` + players.map(p =>
      `<button class="player-chip" data-action="pick-player" data-id="${p.id}">
         <span class="avatar">${esc(initials(p.name))}</span>
         <span>${esc(p.name)}</span>
       </button>`).join('');
  }
}

/* --------------------------------- PALPITES -------------------------------- */
function renderPicks(){
  const pick = myPick();
  const L = pick.locked;
  const parts = [];

  // Semis
  for(const g of SEMIS){
    parts.push(gameCard({
      game:g, data:pick[g.key], disabled:L, mode:'pick',
      advKey:'advance', options:[g.home, g.away],
      badge: L ? `<span class="badge badge-lock">TRAVADO</span>` : `<span class="badge badge-open">ABERTO</span>`,
    }));
  }

  // Campeão da Copa (aposta de torneio)
  parts.push(`
    <div class="ticket card">
      <div class="pick-block">
        <p class="pick-cap">🏆 CAMPEÃO DA COPA (+5)</p>
        <div class="opt-row">${CHAMPION_OPTIONS.map(id => optBtn({
          sel: pick.champion===id, disabled:L, action:'champion', data:{team:id},
          html:`<span class="flag">${TEAMS[id].flag}</span>${TEAMS[id].name}`
        })).join('')}</div>
      </div>
      <div class="pick-block" style="margin-top:14px">
        <p class="pick-cap">🥇 ARTILHEIRO / CHUTEIRA DE OURO (+5)</p>
        <div class="opt-grid3">${SCORERS.map(s => optBtn({
          sel: pick.topScorer===s.id, disabled:L, action:'scorer', data:{id:s.id},
          html:`<span class="flag">${s.flag}</span>${s.name}`
        })).join('')}</div>
      </div>
    </div>`);

  // Barra travar / destravar
  const ready = pick.semi1.advance && pick.semi2.advance && pick.champion && pick.topScorer;
  if(!L){
    parts.push(`
      <div class="ticket card">
        <div class="lockbar">
          <button class="btn btn-primary" data-action="lock" ${ready?'':'disabled'}>🔒 Travar palpites das semis</button>
          ${ready ? `<span class="hint">Tudo preenchido. Você ainda pode revisar.</span>`
                  : `<span class="hint">Preencha "quem avança" nas 2 semis + campeão + artilheiro.</span>`}
        </div>
      </div>`);
  }else{
    parts.push(`
      <div class="ticket card">
        <div class="lockbar">
          <span class="badge badge-lock">🔒 PALPITES TRAVADOS</span>
          <button class="btn btn-ghost btn-sm" data-action="unlock">destravar</button>
        </div>
      </div>`);
  }

  // Final (abre depois das semis)
  const f = finalists();
  if(f){
    parts.push(gameCard({
      game:{ key:'final', label:'Final', date:FINAL_DATE, home:f[0], away:f[1] },
      data:pick.final, disabled:false, mode:'pick',
      advKey:'champion', options:f, advCap:'QUEM É CAMPEÃO (+3)',
      badge:`<span class="badge badge-open">ABERTO</span>`,
    }));
  }else{
    parts.push(`
      <div class="ticket card">
        <div class="card-head"><span class="card-title">Final</span>
          <span class="badge badge-lock">${FINAL_DATE}</span></div>
        <p class="note-soft">🔒 Abre depois das semifinais — quando os dois resultados forem lançados na aba <b>Resultados</b>.</p>
      </div>`);
  }

  viewEl.innerHTML = parts.join('');
}

/* -------------------------------- RESULTADOS ------------------------------- */
function renderResults(){
  const R = state.results;
  const parts = [`<p class="hint" style="margin:0 0 2px">Qualquer jogador pode lançar aqui o resultado real de cada jogo.</p>`];

  for(const g of SEMIS){
    parts.push(gameCard({
      game:g, data:R[g.key], disabled:false, mode:'result',
      advKey:'advance', options:[g.home, g.away], advCap:'QUEM AVANÇOU',
      badge: R[g.key].done ? `<span class="badge badge-done">LANÇADO ✓</span>` : `<span class="badge badge-live">AGUARDANDO</span>`,
      launch:{ done:R[g.key].done, game:g.key },
    }));
  }

  const f = finalists();
  if(f){
    parts.push(gameCard({
      game:{ key:'final', label:'Final', date:FINAL_DATE, home:f[0], away:f[1] },
      data:R.final, disabled:false, mode:'result',
      advKey:'champion', options:f, advCap:'QUEM FOI CAMPEÃO',
      badge: R.final.done ? `<span class="badge badge-done">LANÇADO ✓</span>` : `<span class="badge badge-live">AGUARDANDO</span>`,
      launch:{ done:R.final.done, game:'final' },
    }));
    // Artilheiro real
    parts.push(`
      <div class="ticket card">
        <div class="pick-block">
          <p class="pick-cap">🥇 ARTILHEIRO REAL</p>
          <div class="opt-grid3">${SCORERS.map(s => optBtn({
            sel: R.topScorer===s.id, disabled:false, action:'r-scorer', data:{id:s.id},
            html:`<span class="flag">${s.flag}</span>${s.name}`
          })).join('')}</div>
        </div>
      </div>`);
  }else{
    parts.push(`
      <div class="ticket card">
        <div class="card-head"><span class="card-title">Final</span>
          <span class="badge badge-lock">${FINAL_DATE}</span></div>
        <p class="note-soft">Defina "quem avançou" nas duas semifinais para liberar o resultado da final.</p>
      </div>`);
  }

  viewEl.innerHTML = parts.join('');
}

/* Card genérico de jogo (usado em Palpites e Resultados). */
function gameCard(o){
  const { game, data, disabled, mode, advKey, options, badge } = o;
  const advCap = o.advCap || 'QUEM AVANÇA';
  const isResult = mode==='result';
  const stepAct = isResult ? 'r-step' : 'step';
  const advAct  = isResult ? (advKey==='champion' ? 'r-final-champion' : 'r-advance')
                           : (advKey==='champion' ? 'final-champion'   : 'advance');
  const home = teamOpt(game.home), away = teamOpt(game.away);
  const curAdv = data[advKey];

  const launch = o.launch ? `
    <div class="launch-row">
      <button class="btn ${o.launch.done?'btn-ghost btn-sm':'btn-gold btn-sm'}" data-action="r-toggle-done" data-game="${o.launch.game}">
        ${o.launch.done ? '✎ editar / desmarcar lançado' : '📣 marcar resultado como lançado'}
      </button>
    </div>` : '';

  return `
  <div class="ticket card">
    <div class="card-head">
      <div><span class="card-title">${esc(game.label)}</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="card-date">${game.date||''}</span>${badge||''}
      </div>
    </div>
    <div class="match">
      <div class="score-row">
        <div class="team">
          <span class="flag">${home.flag}</span><span class="team-name">${home.name}</span>
        </div>
        ${stepper(stepAct, game.key, 'home', data.home, disabled)}
        <span class="score-x mono">×</span>
        ${stepper(stepAct, game.key, 'away', data.away, disabled)}
        <div class="team away">
          <span class="flag">${away.flag}</span><span class="team-name">${away.name}</span>
        </div>
      </div>
      <div class="pick-block">
        <p class="pick-cap">${advCap} (+3)</p>
        <div class="opt-row">${options.map(id => optBtn({
          sel: curAdv===id, disabled, action:advAct, data:{game:game.key, team:id},
          html:`<span class="flag">${TEAMS[id].flag}</span>${TEAMS[id].name}`
        })).join('')}</div>
      </div>
      ${launch}
    </div>
  </div>`;
}

function stepper(action, game, side, val, disabled){
  const d = disabled ? 'disabled' : '';
  return `
    <div class="stepper">
      <button class="step-btn" data-action="${action}" data-game="${game}" data-side="${side}" data-delta="-1" ${d}>−</button>
      <span class="score-num">${val}</span>
      <button class="step-btn" data-action="${action}" data-game="${game}" data-side="${side}" data-delta="1" ${d}>+</button>
    </div>`;
}
function optBtn(o){
  const attrs = Object.entries(o.data||{}).map(([k,v])=>`data-${k}="${v}"`).join(' ');
  return `<button class="opt ${o.sel?'sel':''}" data-action="${o.action}" ${attrs} ${o.disabled?'disabled':''}>${o.html}</button>`;
}

/* ---------------------------------- PLACAR --------------------------------- */
let expanded = {};
function renderScore(){
  const rows = computeStandings();
  const parts = [];

  if(!rows.length){
    parts.push(`<p class="note-soft">Ninguém palpitou ainda.</p>`);
  }else{
    const top = rows[0].total;
    const leaderHasPts = top > 0;
    const list = rows.map((r,i) => {
      const isLeader = leaderHasPts && r.total===top && (!r.tie || r.tie!=='empate' || i===0);
      const open = !!expanded[r.pid];
      return `
      <div class="ticket rank-item ${isLeader?'leader':''}">
        <button class="rank-head" data-action="expand" data-id="${r.pid}" aria-expanded="${open}">
          <span class="rank-pos">${i+1}</span>
          <span class="rank-name">
            ${isLeader?'<span class="crown">👑</span>':''}
            <span class="name">${esc(r.name)}</span>
          </span>
          <span class="rank-pts">${r.total}<small>PTS</small></span>
          <span class="chev">›</span>
        </button>
        ${r.tie ? `<div class="tiebreak-note">${r.tie}</div>` : ''}
        ${open ? `<div class="detail">${detailRows(r)}</div>` : ''}
      </div>`;
    }).join('');
    parts.push(`<div class="rank-list">${list}</div>`);
  }

  parts.push(`
    <div class="danger-zone">
      <button class="btn btn-danger btn-block" data-action="reset">🗑️ Reiniciar bolão</button>
    </div>`);

  viewEl.innerHTML = parts.join('');
}

function detailRows(r){
  return r.items.map(it=>{
    if(it.kind==='tournament'){
      if(!it.revealed) return dRow(it.label, `<span class="detail-wait">aguardando resultado</span>`, null);
      const name = it.tour==='scorer' ? scorerName(it.pick) : (it.pick?TEAMS[it.pick].name:'—');
      const mark = it.correct?'<span class="tick">✓</span>':'<span class="cross">✕</span>';
      return dRow(it.label, `seu palpite: <b>${esc(name)}</b> ${mark}`, it.pts);
    }
    // jogo
    if(!it.revealed) return dRow(it.label, `<span class="detail-wait">aguardando resultado</span>`, null);
    const advName = it.pickAdv ? TEAMS[it.pickAdv].name : '—';
    const advMark = it.advCorrect?'<span class="tick">✓</span>':'<span class="cross">✕</span>';
    const exMark  = it.exact?'<span class="tick">✓ exato</span>':'<span class="cross">✕</span>';
    const advLabel = it.kind==='champion' ? 'campeão' : 'avança';
    const val =
      `placar <b>${it.pickHome}×${it.pickAway}</b> ${exMark} ` +
      `<span style="color:var(--ink-soft)">(real ${it.resHome}×${it.resAway})</span><br>` +
      `${advLabel}: <b>${esc(advName)}</b> ${advMark}`;
    return dRow(it.label, val, it.gpts);
  }).join('');
}
function dRow(lbl, val, pts){
  const p = pts==null ? '' :
    `<span class="pts ${pts>0?'win':'zero'}">${pts>0?'+':''}${pts}</span>`;
  return `<div class="detail-row">
    <span class="lbl"><b>${esc(lbl)}</b><br><span class="val" style="text-align:left">${val}</span></span>
    <span class="pts-wrap">${p}</span>
  </div>`;
}
function scorerName(id){ const s = SCORERS.find(x=>x.id===id); return s?s.name:'—'; }

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ============================================================================
   EVENTOS
   ============================================================================ */
document.addEventListener('click', ev=>{
  const btn = ev.target.closest('[data-action]');
  if(!btn) return;
  const a = btn.dataset.action;
  const d = btn.dataset;

  switch(a){
    /* ---- Gate ---- */
    case 'enter': {
      const name = $('#nameInput').value.trim();
      if(!name){ $('#nameInput').focus(); return; }
      enterAs(name);
      break;
    }
    case 'pick-player': me = d.id; saveMe(me); render(); break;
    case 'switch-player': me = null; saveMe(null); render(); break;

    /* ---- Palpites: steppers e opções (escreve só em bolao/picks/{me}) ---- */
    case 'step': {
      const p = myPick();
      if(p.locked) return;
      p[d.game][d.side] = clampGoals(p[d.game][d.side] + (+d.delta));
      savePick(me); render(); break;
    }
    case 'advance': {
      const p = myPick(); if(p.locked) return;
      p[d.game].advance = (p[d.game].advance===d.team) ? null : d.team;
      savePick(me); render(); break;
    }
    case 'champion': {
      const p = myPick(); if(p.locked) return;
      p.champion = (p.champion===d.team) ? null : d.team;
      savePick(me); render(); break;
    }
    case 'scorer': {
      const p = myPick(); if(p.locked) return;
      p.topScorer = (p.topScorer===d.id) ? null : d.id;
      savePick(me); render(); break;
    }
    case 'final-champion': {
      const p = myPick();
      p.final.champion = (p.final.champion===d.team) ? null : d.team;
      savePick(me); render(); break;
    }
    case 'lock': {
      const p = myPick();
      if(!(p.semi1.advance && p.semi2.advance && p.champion && p.topScorer)){
        alert('Preencha "quem avança" nas duas semis, o campeão e o artilheiro antes de travar.');
        return;
      }
      if(confirm('Travar seus palpites das semis? Você poderá destravar depois se precisar corrigir.')){
        p.locked = true; savePick(me); render();
      }
      break;
    }
    case 'unlock': { const p = myPick(); p.locked = false; savePick(me); render(); break; }

    /* ---- Resultados (escreve só em bolao/results/{jogo}) ---- */
    case 'r-step': {
      const R = state.results;
      R[d.game][d.side] = clampGoals(R[d.game][d.side] + (+d.delta));
      saveResultGame(d.game); render(); break;
    }
    case 'r-advance': {
      const R = state.results;
      R[d.game].advance = (R[d.game].advance===d.team) ? null : d.team;
      saveResultGame(d.game); render(); break;
    }
    case 'r-final-champion': {
      state.results.final.champion = (state.results.final.champion===d.team) ? null : d.team;
      saveResultGame('final'); render(); break;
    }
    case 'r-scorer': {
      state.results.topScorer = (state.results.topScorer===d.id) ? null : d.id;
      saveResultScorer(); render(); break;
    }
    case 'r-toggle-done': {
      const g = state.results[d.game];
      if(!g.done && !g.advance && !g.champion){
        alert('Defina primeiro o placar e quem avançou/foi campeão antes de marcar como lançado.');
        return;
      }
      g.done = !g.done; saveResultGame(d.game); render(); break;
    }

    /* ---- Placar ---- */
    case 'expand': expanded[d.id] = !expanded[d.id]; render(); break;
    case 'reset': {
      if(confirm('Reiniciar o bolão? Isso apaga TODOS os jogadores, palpites e resultados.')){
        if(confirm('Tem certeza mesmo? Essa ação não tem como desfazer.')){
          wipeBolao();                 // apaga picks/{id} um a um, + players e results inteiros
          saveMe(null); me=null; expanded={}; tab='picks';
          state = emptyState(); render();
        }
      }
      break;
    }
  }
});

// Enter no campo de nome
document.addEventListener('keydown', ev=>{
  if(ev.key==='Enter' && ev.target && ev.target.id==='nameInput'){
    ev.preventDefault();
    const name = ev.target.value.trim();
    if(name) enterAs(name);
  }
});

// Trocar de aba
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{ tab = t.dataset.tab; render(); });
});

function enterAs(name){
  const existing = findPlayerByName(name);
  if(existing){ me = existing.id; }
  else{
    const id = newId();
    const player = { id, name };
    const pick   = emptyPick();
    state.players[id] = player;
    state.picks[id]   = pick;
    me = id;
    // Passa os objetos por valor (ver comentário em savePlayer/savePick).
    savePlayer(id, player);   // bolao/players/{id}
    savePick(id, pick);       // bolao/picks/{id}
  }
  saveMe(me);
  $('#nameInput').value = '';
  tab = 'picks';
  render();
}

/* ============================================================================
   AUTOTESTE DE PONTUAÇÃO (roda no console ao abrir)
   window.bolaoSelfTest() para rodar de novo.
   ============================================================================ */
function runSelfTest(){
  const snapshot = JSON.stringify(state);   // preserva estado real
  const results = [];
  const check = (nome, got, exp)=>{
    const ok = got===exp; results.push({nome, esperado:exp, obtido:got, ok});
    console[ok?'log':'error'](`${ok?'✅':'❌'} ${nome}: obtido ${got}, esperado ${exp}`);
  };

  // Monta um cenário controlado
  state = emptyState();
  state.results.semi1 = { home:2, away:1, advance:'franca', done:true };  // França 2×1 Espanha, França avança
  state.results.semi2 = { home:0, away:0, advance:'argentina', done:true };// 0×0, Argentina avança (pênaltis)
  state.results.final = { home:1, away:0, champion:'franca', done:true };  // França 1×0 Argentina, campeã
  state.results.topScorer = 'mbappe';

  const addPlayer = (id, pick)=>{ state.players[id]={id,name:id}; state.picks[id]=Object.assign(emptyPick(), pick); };

  // Cenário A: placar exato + avançou certo, na semi1 (5+3=8)
  addPlayer('A', { semi1:{home:2,away:1,advance:'franca'} });
  // Cenário B: placar errado mas avançou certo, na semi1 (0+3=3)
  addPlayer('B', { semi1:{home:3,away:0,advance:'franca'} });
  // Cenário C: tudo errado na semi1 (0+0=0)
  addPlayer('C', { semi1:{home:0,away:2,advance:'espanha'} });
  // Cenário D: SÓ as apostas de torneio — campeão certo (+5) e artilheiro certo (+5) = 10.
  // Palpites de jogo propositalmente 9×9 para não casar acidentalmente com nenhum placar real.
  addPlayer('D', { semi1:{home:9,away:9}, semi2:{home:9,away:9}, final:{home:9,away:9}, champion:'franca', topScorer:'mbappe' });
  // Cenário E: final placar exato + campeão certo (5+3=8)
  addPlayer('E', { final:{home:1,away:0,champion:'franca'} });

  const g = pid => computePlayer(pid).items.find(x=>x.key==='semi1').gpts;
  check('A) placar exato + avançou (semi1)', g('A'), 8);
  check('B) placar errado + avançou certo (semi1)', g('B'), 3);
  check('C) tudo errado (semi1)', g('C'), 0);
  check('D) campeão+artilheiro (torneio)', computePlayer('D').total, 10);
  check('E) final placar exato + campeão', computePlayer('E').items.find(x=>x.key==='final').gpts, 8);

  // Desempate: dois jogadores empatam em 13 pts; X vence por ter mais placares exatos.
  //   X: semi1 exato+avançou (8) + campeão da Copa (+5) = 13, com 1 placar exato.
  //   Y: semi1 só avançou (3) + campeão (+5) + artilheiro (+5) = 13, com 0 placares exatos.
  state = emptyState();
  state.results.semi1 = { home:2, away:1, advance:'franca', done:true };
  state.results.final = { home:1, away:0, champion:'franca', done:true };
  state.results.topScorer = 'mbappe';
  addPlayer('X', { semi1:{home:2,away:1,advance:'franca'}, final:{home:9,away:9}, champion:'franca' });
  addPlayer('Y', { semi1:{home:9,away:9,advance:'franca'}, final:{home:9,away:9}, champion:'franca', topScorer:'mbappe' });
  const st = computeStandings();
  const rowX = st.find(r=>r.pid==='X'), rowY = st.find(r=>r.pid==='Y');
  check('Desempate: X (1 exato) à frente de Y (0 exatos) com totais iguais',
        (rowX.total===rowY.total && st.indexOf(rowX) < st.indexOf(rowY)) ? 'X-na-frente' : 'falhou',
        'X-na-frente');

  const allOk = results.every(r=>r.ok);
  console.log(`\n🎟️ Autoteste do bolão: ${allOk?'TODOS PASSARAM':'FALHOU — ver acima'}`);
  state = JSON.parse(snapshot);  // restaura estado real
  return allOk;
}
window.bolaoSelfTest = runSelfTest;

/* ============================================================================
   PONTE COM A CAMADA FIREBASE (chamada pelo módulo inline do index.html)
   ============================================================================ */
function hideBoot(){ if(bootEl) bootEl.hidden = true; }
function showBootError(msg){
  booted = false;
  if(gateEl) gateEl.hidden = true;
  if(appEl)  appEl.hidden  = true;
  if(bootEl){
    bootEl.hidden = false;
    bootEl.classList.add('error');
    if(bootMsgEl)   bootMsgEl.textContent = msg || 'Sem conexão — verifique sua internet e recarregue.';
    if(bootRetryEl) bootRetryEl.hidden = false;
  }
}
// Recebe o snapshot cru do RTDB, normaliza, e re-renderiza (tempo real).
function applyRemoteState(raw){
  state = fromDb(raw);
  if(!booted){ booted = true; hideBoot(); }
  render();
}
// Indicador discreto "sincronizando…" quando a conexão cai momentaneamente.
function setSyncing(on){ if(syncBadgeEl && booted) syncBadgeEl.hidden = !on; }
// Injeta a API de escrita do Firebase.
function attachPersistence(api){ persist = api; }

window.BolaoApp = { applyRemoteState, setSyncing, showBootError, attachPersistence };

/* ============================================================================
   BOOT — o autoteste roda offline; a UI só aparece após o Firebase conectar
   (applyRemoteState) ou mostrar erro (showBootError), disparados pelo index.html.
   ============================================================================ */
try{ runSelfTest(); }catch(e){ console.error('Autoteste falhou ao rodar:', e); }
