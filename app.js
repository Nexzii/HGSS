// ── STATE ──
const state = {
  streams:{1:null,2:null}, mirrored:{1:false,2:false}, fpsIv:{1:null,2:null},
  picker:{player:null,slot:null},
  shinys:{1:[null,null,null,null,null,null],2:[null,null,null,null,null,null]},
  allPokemon:[], streamMode:false,
  // Compteur shiny
  counts:{1:0, 2:0},
  steps:{1:1, 2:1},
  huntPoke:{1:null, 2:null},
  pickerMode:'shiny', // 'shiny' | 'hunt'
  localRole:'both', // 'hg' | 'ss' | 'both'
  // Timers individuels
  timers:{1:0, 2:0},
  timerRunning:{1:false, 2:false},
  timerIntervals:{1:null, 2:null},
  // Câble Link / PeerJS variables
  peer:null,
  conn:null,
  activeCall:null,
  roomCode:null,
  peerRole:null, // 'host' | 'joiner'
};


const $=id=>document.getElementById(id);
const splash=$('splash-screen'),app=$('app');

// ── LAUNCHER & AUTO-UPDATER ──
const CURRENT_VERSION = 'v1.9';
let activeGameMode = 'duo-vs';

// Auto-Updater Check
async function checkUpdates() {
  const container = $('updater-status');
  if (!container) return;
  try {
    const res = await fetch('https://api.github.com/repos/Nexzii/HGSS/releases/latest');
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    const latestVersion = data.tag_name;
    
    if (latestVersion && latestVersion !== CURRENT_VERSION) {
      // Look for the compiled Windows Setup .exe in release assets
      const exeAsset = data.assets && data.assets.find(asset => asset.name.endsWith('.exe'));
      
      if (exeAsset && window.electronAPI) {
        // We are inside the desktop application and can auto-download and install!
        container.innerHTML = `
          <div class="update-banner loading" style="text-align: center;">
            <span class="update-blink">⏳</span> Téléchargement de la mise à jour <strong>${latestVersion}</strong>...
            <div class="progress-bar-container">
              <div class="progress-bar-fill" id="update-progress-fill" style="width: 0%"></div>
            </div>
            <span class="progress-percent" id="update-progress-percent">0%</span>
          </div>`;

        // Register IPC update progress listeners
        window.electronAPI.onDownloadProgress((percent) => {
          const fill = $('update-progress-fill');
          const text = $('update-progress-percent');
          if (fill) fill.style.width = percent + '%';
          if (text) text.textContent = percent + '%';
        });

        window.electronAPI.onDownloadComplete(() => {
          container.innerHTML = `
            <div class="update-banner success">
              🎉 Téléchargement réussi ! Installation en cours...
            </div>`;
        });

        window.electronAPI.onDownloadError((err) => {
          container.innerHTML = `
            <div class="update-banner error">
              ⚠ Échec de l'auto-update : ${err}. 
              <a href="${data.html_url}" target="_blank" class="btn-update-download">Téléchargement manuel</a>
            </div>`;
        });

        // Trigger the safe Electron main process download
        window.electronAPI.downloadUpdate(exeAsset.browser_download_url);
      } else {
        // Fallback for browser view or if no .exe asset is attached
        container.innerHTML = `
          <div class="update-banner available">
            <span class="update-blink">✨</span> Mise à jour <strong>${latestVersion}</strong> dispo !
            <a href="${data.html_url}" target="_blank" class="btn-update-download">Télécharger</a>
          </div>`;
      }
    } else {
      container.innerHTML = `
        <div class="update-banner up-to-date">
          ✓ Version à jour (${CURRENT_VERSION})
        </div>`;
    }
  } catch(e) {
    container.innerHTML = `
      <div class="update-banner error">
        ⚠ Échec de vérification des maj
      </div>`;
  }
}

// Helper to check if a player console panel is locked for the local user
function isPlayerLocked(p) {
  const isMulti = !!state.conn;
  if (isMulti) {
    if (state.peerRole === 'host' && p === 2) return true;
    if (state.peerRole === 'joiner' && p === 1) return true;
  } else {
    if (state.localRole === 'hg' && p === 2) return true;
    if (state.localRole === 'ss' && p === 1) return true;
  }
  return false;
}

// Local Role Setter
function setLocalRole(role) {
  state.localRole = role;

  // Sync active states in Settings Modal
  ['hg', 'ss', 'both'].forEach(r => {
    const btn = $(`btn-set-role-${r}`);
    if (btn) {
      btn.classList.toggle('active', r === role);
    }
  });

  updateUILocks();
  saveState();
}

// Mode Selector Setter
function setGameMode(mode) {
  activeGameMode = mode;
  localStorage.setItem('hgss-saved-gamemode', mode);

  // Apply layout classes to body
  document.body.classList.remove('mode-solo-hg', 'mode-solo-ss', 'mode-duo-vs');
  if (mode === 'solo-hg') {
    document.body.classList.add('mode-solo-hg');
  } else if (mode === 'solo-ss') {
    document.body.classList.add('mode-solo-ss');
  } else {
    document.body.classList.add('mode-duo-vs');
  }

  // Show/Hide local role selector group based on layout mode
  const roleGroup = $('set-group-role');
  if (roleGroup) {
    if (mode === 'duo-vs') {
      roleGroup.style.display = 'block';
    } else {
      roleGroup.style.display = 'none';
    }
  }

  // Sync active states on launcher cards
  ['hg', 'ss', 'duo'].forEach(m => {
    const btn = $(`btn-mode-${m}`);
    if (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
  });

  // Sync active states in Settings Modal
  ['hg', 'ss', 'duo'].forEach(m => {
    const btn = $(`btn-set-mode-${m}`);
    if (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
  });
}

function launchApp() {
  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.classList.add('hidden');
    app.classList.remove('hidden');
    initCams();
    loadPokemon();
    restoreState();
  }, 600);
}

// Bind Launcher mode card clicks
['hg', 'ss', 'duo'].forEach(m => {
  const btn = $(`btn-mode-${m}`);
  if (btn) {
    btn.addEventListener('click', () => {
      setGameMode(btn.dataset.mode);
      launchApp();
    });
  }
});

// Bind Settings Modal mode switcher clicks
['hg', 'ss', 'duo'].forEach(m => {
  const btn = $(`btn-set-mode-${m}`);
  if (btn) {
    btn.addEventListener('click', () => {
      setGameMode(btn.dataset.mode);
    });
  }
});

// Bind Settings Modal local role selection clicks
['hg', 'ss', 'both'].forEach(r => {
  const btn = $(`btn-set-role-${r}`);
  if (btn) {
    btn.addEventListener('click', () => {
      setLocalRole(r);
    });
  }
});

// Initialize on page load
(function initLauncher() {
  checkUpdates();
  
  // Restore saved game mode
  const savedMode = localStorage.getItem('hgss-saved-gamemode') || 'duo-vs';
  setGameMode(savedMode);
})();

// ── CAMERAS ──
async function initCams(){
  try{
    await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    const devs=await navigator.mediaDevices.enumerateDevices();
    fillSelects(devs.filter(d=>d.kind==='videoinput'));
  }catch(e){console.warn(e);}
}
function fillSelects(devs){
  [1,2].forEach(p=>{
    const sel=$(`camera-select-${p}`);
    sel.innerHTML='<option value="">Caméra...</option>';
    devs.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Caméra ${i+1}`;sel.appendChild(o);});
    if(devs[p-1])sel.value=devs[p-1].deviceId;
  });
}
navigator.mediaDevices.addEventListener('devicechange',async()=>{
  fillSelects((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));
});
[1,2].forEach(p=>{
  $(`btn-cam-${p}`).addEventListener('click',()=>toggleCam(p));
  $(`btn-mirror-${p}`).addEventListener('click',()=>toggleMirror(p));
  $(`camera-select-${p}`).addEventListener('change',()=>{if(state.streams[p])startCam(p);});
});
async function toggleCam(p){
  if(isPlayerLocked(p)) return;
  state.streams[p]?stopCam(p):await startCam(p);
}
async function startCam(p){
  if(isPlayerLocked(p)) return;
  const devId=$(`camera-select-${p}`).value;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:devId?{deviceId:{exact:devId},width:{ideal:1280},height:{ideal:960}}:{width:{ideal:1280}},audio:false});
    state.streams[p]=stream;
    const vid=$(`video-${p}`);vid.srcObject=stream;
    vid.onloadedmetadata=()=>{$(`res-${p}`).textContent=`${vid.videoWidth}x${vid.videoHeight}`;startFPS(p,stream);};
    $(`no-signal-${p}`).classList.add('hidden');
    $(`btn-cam-${p}`).classList.add('active');
    const s=$(`status-${p}`);s.textContent='ON';s.className='s-on';
    updateMediaCall();
  }catch(e){showCustomAlert(`Erreur caméra ${p}: ${e.message}`);}
}
function stopCam(p){
  if(state.streams[p])state.streams[p].getTracks().forEach(t=>t.stop());
  state.streams[p]=null;$(`video-${p}`).srcObject=null;
  $(`no-signal-${p}`).classList.remove('hidden');$(`btn-cam-${p}`).classList.remove('active');
  const s=$(`status-${p}`);s.textContent='OFF';s.className='s-off';
  $(`res-${p}`).textContent='—';$(`fps-${p}`).textContent='—';
  if(state.fpsIv[p]){clearInterval(state.fpsIv[p]);state.fpsIv[p]=null;}
  updateMediaCall();
}
function toggleMirror(p){
  state.mirrored[p]=!state.mirrored[p];
  $(`video-${p}`).classList.toggle('mirrored',state.mirrored[p]);
  $(`btn-mirror-${p}`).classList.toggle('active',state.mirrored[p]);
}
function startFPS(p,stream){
  if(state.fpsIv[p])clearInterval(state.fpsIv[p]);
  state.fpsIv[p]=setInterval(()=>{
    const t=stream.getVideoTracks()[0];
    if(t){const fps=t.getSettings().frameRate;if(fps)$(`fps-${p}`).textContent=Math.round(fps);}
  },1000);
}

// ── PLAYER LABELS ──
function syncLabels(){
  [1,2].forEach(p=>{$(`shiny-label-${p}`).textContent=`${$(`name-${p}`).value||'Joueur '+p} — ${p===1?'HeartGold':'SoulSilver'}`;});
  saveState();
  broadcastState();
}
$('name-1').addEventListener('input',syncLabels);
$('name-2').addEventListener('input',syncLabels);

// ── SETTINGS ──
$('btn-settings').addEventListener('click',()=>$('modal-settings').classList.remove('hidden'));
$('btn-close-set').addEventListener('click',()=>$('modal-settings').classList.add('hidden'));
$('modal-settings').querySelector('.modal-bg').addEventListener('click',()=>$('modal-settings').classList.add('hidden'));
document.querySelectorAll('.btn-opt[data-ratio]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.btn-opt[data-ratio]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.ds-screen').forEach(s=>s.style.aspectRatio=b.dataset.ratio);
  });
});
$('tog-stream').addEventListener('change',e=>{
  state.streamMode=e.target.checked;document.body.classList.toggle('stream-mode',state.streamMode);
});

// ── FULLSCREEN ──
$('btn-fullscreen').addEventListener('click',()=>{
  document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
});

// ── TOGGLE LINK CABLE PANEL ──
$('btn-toggle-link').addEventListener('click',()=>{
  $('link-cable-bar').classList.toggle('collapsed');
  $('btn-toggle-link').classList.toggle('active');
});

// ── KEYBOARD ──
document.addEventListener('keydown',e=>{
  if(document.activeElement.tagName==='INPUT')return;
  if(e.key==='1')toggleCam(1);if(e.key==='2')toggleCam(2);
  if(e.key==='s'||e.key==='S')$('modal-settings').classList.toggle('hidden');
  if(e.key==='m'||e.key==='M'){const t=$('tog-stream');t.checked=!t.checked;t.dispatchEvent(new Event('change'));}
  if(e.key==='Escape'){$('modal-settings').classList.add('hidden');$('modal-picker').classList.add('hidden');}
});

// ── POKÉMON EN FRANÇAIS via GraphQL PokeAPI ──
async function loadPokemon(){
  if(state.allPokemon.length)return;
  const CACHE_KEY='hgss-fr-v2';
  const cached=localStorage.getItem(CACHE_KEY);
  if(cached){state.allPokemon=JSON.parse(cached);return;}

  // Afficher indicateur de chargement
  const el=$('poke-results');
  if(el)el.innerHTML='<div class="poke-loading">⏳ Chargement des noms français...</div>';

  try{
    // GraphQL PokeAPI — noms français (language_id=5) pour les 493 Pokémon HGSS
    const query=`{pokemon_v2_pokemonspeciesname(where:{language_id:{_eq:5}},order_by:{pokemon_species_id:asc},limit:493){name pokemon_species_id}}`;
    const res=await fetch('https://beta.pokeapi.co/graphql/v1beta',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query})
    });
    const json=await res.json();
    state.allPokemon=json.data.pokemon_v2_pokemonspeciesname.map(p=>({
      id:p.pokemon_species_id,
      name:p.name
    }));
    localStorage.setItem(CACHE_KEY,JSON.stringify(state.allPokemon));
  }catch(err){
    console.warn('GraphQL failed, fallback REST',err);
    // Fallback: REST API noms anglais
    try{
      const r=await fetch('https://pokeapi.co/api/v2/pokemon?limit=493');
      const d=await r.json();
      state.allPokemon=d.results.map((p,i)=>({id:i+1,name:p.name}));
    }catch(e){console.error(e);}
  }
}

// ── SPRITE SHINY ──
function shinyUrl(id){return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;}

// ── PICKER ──
function openPicker(player,slot){
  if(isPlayerLocked(player)) return;
  state.picker={player,slot};
  $('modal-picker').classList.remove('hidden');
  $('poke-search').value='';
  $('poke-search').focus();
  renderPokeResults('');
}
$('btn-close-pick').addEventListener('click',()=>$('modal-picker').classList.add('hidden'));
$('modal-picker').querySelector('.modal-bg').addEventListener('click',()=>$('modal-picker').classList.add('hidden'));
$('poke-search').addEventListener('input',e=>renderPokeResults(e.target.value));

function renderPokeResults(query){
  const container=$('poke-results');
  const q=query.trim().toLowerCase();
  if(!state.allPokemon.length){container.innerHTML='<div class="poke-loading">⏳ Chargement...</div>';loadPokemon().then(()=>renderPokeResults(query));return;}
  const list=q?state.allPokemon.filter(p=>p.name.toLowerCase().includes(q)).slice(0,80):state.allPokemon.slice(0,80);
  if(!list.length){container.innerHTML='<div class="poke-loading">Aucun résultat</div>';return;}
  container.innerHTML=list.map(p=>`
    <div class="poke-card" data-id="${p.id}" data-name="${p.name}">
      <img src="${shinyUrl(p.id)}" alt="${p.name}" loading="lazy" onerror="this.style.opacity='.3'">
      <span>${p.name}</span>
    </div>`).join('');
  container.querySelectorAll('.poke-card').forEach(card=>{
    card.addEventListener('click',()=>selectPokemon(parseInt(card.dataset.id),card.dataset.name));
  });
}

function selectPokemon(id,name){
  if(state.pickerMode==='hunt'){
    const p=state.picker.player;
    state.huntPoke[p]={id,name};
    renderHuntPoke(p);
    $('modal-picker').classList.add('hidden');
    state.pickerMode='shiny';
  }else{
    const{player,slot}=state.picker;
    if(slot===null)return;
    state.shinys[player][slot]={id,name};
    renderShinySlot(player,slot);
    $('modal-picker').classList.add('hidden');
  }
  broadcastState();
}

function renderShinySlot(player,slot){
  const poke=state.shinys[player][slot];
  const el=document.querySelector(`.shiny-slot[data-player="${player}"][data-slot="${slot}"]`);
  if(!el)return;
  if(!poke){
    el.innerHTML='<div class="slot-inner"><span class="slot-add">+</span></div>';
    el.classList.remove('filled');
  }else{
    el.classList.add('filled');
    el.innerHTML=`
      <div class="slot-inner">
        <img class="slot-sprite" src="${shinyUrl(poke.id)}" alt="${poke.name}">
        <span class="slot-pname">${poke.name}</span>
      </div>
      <button class="slot-clear">✕</button>`;
    el.querySelector('.slot-clear').addEventListener('click',ev=>{
      ev.stopPropagation();
      if(isPlayerLocked(player)) return;
      state.shinys[player][slot]=null;
      renderShinySlot(player,slot);
      el.addEventListener('click',()=>openPicker(player,slot));
      broadcastState();
    });
  }
  saveState();
}

function initShinySlots(){
  document.querySelectorAll('.shiny-slot').forEach(s=>{
    s.addEventListener('click',()=>openPicker(parseInt(s.dataset.player),parseInt(s.dataset.slot)));
  });
}
initShinySlots();

// ── SHINY COUNTER ──
// Probabilité shiny HGSS : 1/8192 de base, radar/oeuf différent
function shinyProb(n){
  const p=1-(8191/8192)**n;
  return (p*100).toFixed(2);
}

function updateCounterUI(p){
  const val=$(`count-val-${p}`);
  val.textContent=state.counts[p];
  // Bump animation
  val.classList.remove('bump');
  void val.offsetWidth;
  val.classList.add('bump');
  setTimeout(()=>val.classList.remove('bump'),150);
  // Probabilité
  let prob=document.getElementById(`prob-${p}`);
  if(prob) prob.innerHTML=`Prob. shiny : <span>${shinyProb(state.counts[p])}%</span>`;
}

function renderHuntPoke(p){
  const poke=state.huntPoke[p];
  const container=$(`counter-poke-${p}`);
  if(!poke){
    container.innerHTML=`<button class="btn-pick-hunt" id="btn-pick-hunt-${p}" data-player="${p}">🔍 Choisir le Pokémon chassé</button>`;
    $(`btn-pick-hunt-${p}`).addEventListener('click',()=>openHuntPicker(p));
  }else{
    container.innerHTML=`
      <img class="hunt-sprite" src="${shinyUrl(poke.id)}" alt="${poke.name}">
      <span class="hunt-name">✨ ${poke.name}</span>
      <button class="btn-change-hunt" data-player="${p}">Changer</button>`;
    container.querySelector('.btn-change-hunt').addEventListener('click',()=>openHuntPicker(p));
  }
  // Add prob line if not there
  const counter=$(`counter-${p}`);
  if(!document.getElementById(`prob-${p}`)){
    const d=document.createElement('div');
    d.className='shiny-prob';d.id=`prob-${p}`;
    d.innerHTML=`Prob. shiny : <span>${shinyProb(state.counts[p])}%</span>`;
    counter.appendChild(d);
  }
  saveState();
}

function openHuntPicker(p){
  state.pickerMode='hunt';
  state.picker={player:p,slot:null};
  $('modal-picker').classList.remove('hidden');
  $('poke-search').value='';
  $('poke-search').focus();
  renderPokeResults('');
}


// Init counter controls
[1,2].forEach(p=>{
  // + / -
  $(`btn-plus-${p}`).addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    startTimerIfNeeded(p);
    state.counts[p]=Math.max(0,state.counts[p]+state.steps[p]);
    updateCounterUI(p);saveState();broadcastState();
  });
  $(`btn-minus-${p}`).addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    startTimerIfNeeded(p);
    state.counts[p]=Math.max(0,state.counts[p]-state.steps[p]);
    updateCounterUI(p);saveState();broadcastState();
  });
  // Reset
  $(`btn-reset-${p}`).addEventListener('click',async()=>{
    if(isPlayerLocked(p)) return;
    const confirmed = await showCustomConfirm(`Remettre le compteur de ${$(`name-${p}`).value||'Joueur '+p} à 0 ?`);
    if(confirmed){
      state.counts[p]=0;updateCounterUI(p);saveState();broadcastState();
    }
  });
  // Step presets
  document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(isPlayerLocked(p)) return;
      const v=parseInt(btn.dataset.val)||1;
      state.steps[p]=v;
      $(`step-input-${p}`).value=v;
      document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      saveState();broadcastState();
    });
  });
  // Custom step input
  $(`step-input-${p}`).addEventListener('input',e=>{
    if(isPlayerLocked(p)) return;
    const v=Math.max(1,parseInt(e.target.value)||1);
    state.steps[p]=v;
    document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(b=>b.classList.remove('active'));
    saveState();broadcastState();
  });
  // Hunt picker btn
  $(`btn-pick-hunt-${p}`).addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    openHuntPicker(p);
  });
});

// ── PERSISTANCE LOCALSTORAGE ──
const SAVE_KEY='hgss-stream-save-v1';

function saveState(){
  const data={
    names:{1:$('name-1').value,2:$('name-2').value},
    counts:state.counts,
    steps:state.steps,
    shinys:state.shinys,
    huntPoke:state.huntPoke,
    localRole:state.localRole,
    timers:state.timers, // Save timer seconds!
  };
  localStorage.setItem(SAVE_KEY,JSON.stringify(data));
}

function restoreState(){
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw)return;
  try{
    const data=JSON.parse(raw);
    // Noms joueurs
    if(data.names){
      [1,2].forEach(p=>{
        if(data.names[p]){
          $(`name-${p}`).value=data.names[p];
        }
      });
      syncLabels();
    }
    // Compteurs
    if(data.counts) state.counts={1:data.counts[1]||0,2:data.counts[2]||0};
    // Steps
    if(data.steps){
      state.steps={1:data.steps[1]||1,2:data.steps[2]||1};
      [1,2].forEach(p=>{
        $(`step-input-${p}`).value=state.steps[p];
      });
    }
    // Shinys collection
    if(data.shinys){
      [1,2].forEach(p=>{
        if(data.shinys[p]){
          state.shinys[p]=data.shinys[p];
          state.shinys[p].forEach((poke,slot)=>{
            if(poke) renderShinySlot(p,slot);
          });
        }
      });
    }
    // Hunt Pokémon
    if(data.huntPoke){
      [1,2].forEach(p=>{
        if(data.huntPoke[p]){
          state.huntPoke[p]=data.huntPoke[p];
          renderHuntPoke(p);
        }
      });
    }
    // Roles restore
    if(data.localRole) {
      state.localRole = data.localRole;
    } else {
      state.localRole = 'both';
    }
    setLocalRole(state.localRole);

    // Timers restore
    if (data.timers) {
      state.timers = { 1: data.timers[1] || 0, 2: data.timers[2] || 0 };
    }
    [1, 2].forEach(p => updateTimerUI(p));

    // Update counter displays
    [1,2].forEach(p=>updateCounterUI(p));
  }catch(e){console.warn('Restore failed:',e);}
}

// ── MULTIPLAYER LINK CABLE SYSTEM (PEERJS) ──

// Broadcasts our local state to our connected peer
function broadcastState() {
  if (!state.conn || !state.peerRole) return;
  const localPlayer = state.peerRole === 'host' ? 1 : 2;
  state.conn.send({
    type: 'state-sync',
    role: state.peerRole, // Send peer role so the remote side routes it to P1 or P2 correctly!
    name: $(`name-${localPlayer}`).value,
    count: state.counts[localPlayer],
    huntPoke: state.huntPoke[localPlayer],
    shinys: state.shinys[localPlayer],
    timer: state.timers[localPlayer], // Send timer seconds!
    timerRunning: state.timerRunning[localPlayer] // Send active timer running state!
  });
}

// Triggers or updates the WebRTC video exchange
function updateMediaCall() {
  if (!state.peer || !state.conn) return;

  if (state.peerRole === 'joiner') {
    // Guest calls Host
    if (state.activeCall) {
      state.activeCall.close();
      state.activeCall = null;
    }
    const myStream = state.streams[2];
    if (myStream) {
      // Connect call passing our local stream
      const call = state.peer.call('hgss-' + state.roomCode, myStream);
      state.activeCall = call;
      setupCallListeners(call);
    } else {
      // Let Host know we stopped camera
      state.conn.send({ type: 'camera-off', player: 2 });
    }
  } else if (state.peerRole === 'host') {
    // Host asks Joiner to re-initiate call so Guest gets latest Host stream
    state.conn.send({ type: 'camera-update' });
  }
}

// Setup common call stream receivers
function setupCallListeners(call) {
  call.on('stream', remoteStream => {
    const remotePlayer = state.peerRole === 'host' ? 2 : 1;
    const vid = $(`video-${remotePlayer}`);
    vid.srcObject = remoteStream;
    vid.onloadedmetadata = () => {
      $(`res-${remotePlayer}`).textContent = `${vid.videoWidth}x${vid.videoHeight}`;
      startFPS(remotePlayer, remoteStream);
    };
    $(`no-signal-${remotePlayer}`).classList.add('hidden');
    $(`btn-cam-${remotePlayer}`).classList.add('active');
    const s = $(`status-${remotePlayer}`);
    s.textContent = 'ON';
    s.className = 's-on';
  });
  call.on('close', () => {
    const remotePlayer = state.peerRole === 'host' ? 2 : 1;
    stopRemoteCamera(remotePlayer);
  });
}

function stopRemoteCamera(p) {
  const vid = $(`video-${p}`);
  vid.srcObject = null;
  $(`no-signal-${p}`).classList.remove('hidden');
  $(`btn-cam-${p}`).classList.remove('active');
  const s = $(`status-${p}`);
  s.textContent = 'OFF';
  s.className = 's-off';
  $(`res-${p}`).textContent = '—';
  $(`fps-${p}`).textContent = '—';
}

// Lock/unlock UI elements depending on role
function updateUILocks() {
  const isMulti = !!state.conn;
  const isHost = state.peerRole === 'host';
  const isJoiner = state.peerRole === 'joiner';

  // Player 1 is locked if they are remote (multiplayer joiner, or local ss-only role)
  const lock1 = (isMulti && isJoiner) || (!isMulti && state.localRole === 'ss');
  // Player 2 is locked if they are remote (multiplayer host, or local hg-only role)
  const lock2 = (isMulti && isHost) || (!isMulti && state.localRole === 'hg');

  // Lock remote fields
  $(`name-1`).disabled = lock1;
  $(`name-2`).disabled = lock2;
  
  $(`camera-select-1`).disabled = lock1;
  $(`camera-select-2`).disabled = lock2;

  // Lock interactive inputs specifically
  [1, 2].forEach(p => {
    const locked = p === 1 ? lock1 : lock2;
    
    // Lock counter container
    const counter = $(`counter-${p}`);
    if (counter) {
      counter.classList.toggle('locked-ui', locked);
    }

    // Lock shiny slots
    document.querySelectorAll(`.shiny-slot[data-player="${p}"]`).forEach(s => {
      s.classList.toggle('locked-ui', locked);
    });

    // Lock camera buttons
    const btnCam = $(`btn-cam-${p}`);
    const btnMirror = $(`btn-mirror-${p}`);
    if (btnCam) btnCam.classList.toggle('locked-ui', locked);
    if (btnMirror) btnMirror.classList.toggle('locked-ui', locked);

    // Lock timer container and buttons
    const timerBar = $(`timer-bar-${p}`);
    const btnTimerToggle = $(`btn-timer-toggle-${p}`);
    const btnTimerReset = $(`btn-timer-reset-${p}`);
    if (timerBar) timerBar.classList.toggle('locked-ui', locked);
    if (btnTimerToggle) btnTimerToggle.classList.toggle('locked-ui', locked);
    if (btnTimerReset) btnTimerReset.classList.toggle('locked-ui', locked);
  });
}

// Handle all received data packages
function handleDataMessage(data) {
  if (data.type === 'state-sync') {
    const p = data.role === 'host' ? 1 : 2; // host represents Player 1, joiner represents Player 2
    
    // Update name
    $(`name-${p}`).value = data.name || '';
    $(`shiny-label-${p}`).textContent = `${data.name || 'Joueur '+p} — ${p===1?'HeartGold':'SoulSilver'}`;
    
    // Update counter
    state.counts[p] = data.count || 0;
    updateCounterUI(p);
    
    // Update hunt poke
    state.huntPoke[p] = data.huntPoke || null;
    renderHuntPoke(p);
    
    // Update shiny slots
    if (data.shinys) {
      state.shinys[p] = data.shinys;
      state.shinys[p].forEach((poke, slot) => {
        renderShinySlot(p, slot);
      });
    }

    // Update remote timer
    if (typeof data.timer === 'number') {
      state.timers[p] = data.timer;
      if (data.timerRunning) {
        if (!state.timerRunning[p]) {
          state.timerRunning[p] = true;
          if (state.timerIntervals[p]) clearInterval(state.timerIntervals[p]);
          state.timerIntervals[p] = setInterval(() => {
            state.timers[p]++;
            updateTimerUI(p);
          }, 1000);
        }
      } else {
        if (state.timerRunning[p]) {
          state.timerRunning[p] = false;
          if (state.timerIntervals[p]) {
            clearInterval(state.timerIntervals[p]);
            state.timerIntervals[p] = null;
          }
        }
      }
      updateTimerUI(p);
    }

    saveState();
  } else if (data.type === 'camera-update') {
    // Peer requested us to call them or re-send stream
    updateMediaCall();
  } else if (data.type === 'camera-off') {
    stopRemoteCamera(data.player);
  }
}

// ── CONNECTION CONTROLS ──

const statusLight = $('lc-status-light');
const statusText = $('lc-status-text');
const groupOffline = $('lc-group-offline');
const groupHosting = $('lc-group-hosting');
const groupConnected = $('lc-group-connected');
const myCodeDisplay = $('lc-my-code');
const joinCodeInput = $('lc-join-code');

$('btn-lc-host').addEventListener('click', () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  state.roomCode = code;
  state.peerRole = 'host';
  
  // Set UI to Hosting
  statusLight.className = 'lc-status-dot hosting';
  statusText.textContent = 'En attente...';
  groupOffline.classList.add('hidden');
  groupHosting.classList.remove('hidden');
  myCodeDisplay.textContent = code;

  // Initialize Host Peer
  state.peer = new Peer('hgss-' + code);
  
  state.peer.on('open', () => {
    console.log('Host Peer opened with ID: hgss-' + code);
  });

  state.peer.on('connection', conn => {
    state.conn = conn;
    setupConnection(conn);
  });

  state.peer.on('call', call => {
    state.activeCall = call;
    // Answer call sending our local stream 1 (if active)
    call.answer(state.streams[1] || undefined);
    setupCallListeners(call);
  });

  state.peer.on('error', err => {
    showCustomAlert('Erreur réseau (Hôte) : ' + err.type);
    disconnectMultiplayer();
  });
});

$('btn-lc-cancel-host').addEventListener('click', disconnectMultiplayer);
$('btn-lc-disconnect').addEventListener('click', disconnectMultiplayer);

$('btn-lc-join').addEventListener('click', () => {
  const code = joinCodeInput.value.trim();
  if (code.length !== 6 || isNaN(code)) {
    showCustomAlert('Le code doit comporter 6 chiffres !');
    return;
  }

  state.roomCode = code;
  state.peerRole = 'joiner';

  statusLight.className = 'lc-status-dot hosting';
  statusText.textContent = 'Connexion...';
  groupOffline.classList.add('hidden');
  groupHosting.classList.add('hidden');
  
  // Initialize Joiner Peer
  state.peer = new Peer();
  
  state.peer.on('open', () => {
    console.log('Joiner Peer opened');
    const conn = state.peer.connect('hgss-' + code);
    state.conn = conn;
    setupConnection(conn);
  });

  state.peer.on('call', call => {
    state.activeCall = call;
    call.answer(state.streams[2] || undefined);
    setupCallListeners(call);
  });

  state.peer.on('error', err => {
    showCustomAlert('Impossible de rejoindre cette partie. Vérifie le code !');
    disconnectMultiplayer();
  });
});

function setupConnection(conn) {
  conn.on('open', () => {
    statusLight.className = 'lc-status-dot connected';
    statusText.textContent = 'Câble branché';
    groupOffline.classList.add('hidden');
    groupHosting.classList.add('hidden');
    groupConnected.classList.remove('hidden');

    updateUILocks();
    
    // Broadcast initial state
    broadcastState();
    
    // Trigger video stream transfer
    updateMediaCall();
  });

  conn.on('data', data => {
    handleDataMessage(data);
  });

  conn.on('close', () => {
    disconnectMultiplayer();
  });
}

function disconnectMultiplayer() {
  if (state.conn) {
    try { state.conn.close(); } catch(e){}
    state.conn = null;
  }
  if (state.activeCall) {
    try { state.activeCall.close(); } catch(e){}
    state.activeCall = null;
  }
  if (state.peer) {
    try { state.peer.destroy(); } catch(e){}
    state.peer = null;
  }
  
  state.peerRole = null;
  state.roomCode = null;

  // Stop remote stream views
  stopRemoteCamera(1);
  stopRemoteCamera(2);
  
  // Restore local stream if stopped
  if (state.streams[1]) {
    $('video-1').srcObject = state.streams[1];
    $('no-signal-1').classList.add('hidden');
  }
  if (state.streams[2]) {
    $('video-2').srcObject = state.streams[2];
    $('no-signal-2').classList.add('hidden');
  }

  // Set UI back to Offline
  statusLight.className = 'lc-status-dot offline';
  statusText.textContent = 'Hors ligne';
  groupOffline.classList.remove('hidden');
  groupHosting.classList.add('hidden');
  groupConnected.classList.add('hidden');
  joinCodeInput.value = '';

  updateUILocks();
}

// ── CUSTOM WINDOW CONTROLS (ELECTRON IPC) ──
(function initWindowControls() {
  const isElectron = typeof window.electronAPI !== 'undefined';
  
  if (!isElectron) {
    // Add fallback class to body when running in standard web browser (like chrome)
    document.body.classList.add('is-browser');
    return;
  }

  const btnMin = document.getElementById('tb-btn-minimize');
  const btnMax = document.getElementById('tb-btn-maximize');
  const btnClose = document.getElementById('tb-btn-close');

  if (btnMin) {
    btnMin.addEventListener('click', () => {
      window.electronAPI.minimize();
    });
  }

  if (btnMax) {
    btnMax.addEventListener('click', () => {
      window.electronAPI.maximize();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      window.electronAPI.close();
    });
  }

  // Update maximize/restore symbols and tooltips on window state changes
  window.electronAPI.onWindowStateChange((state) => {
    if (state === 'maximized') {
      if (btnMax) {
        btnMax.textContent = '🗗'; // Restore down symbol
        btnMax.title = 'Restaurer';
      }
    } else {
      if (btnMax) {
        btnMax.textContent = '🗖'; // Maximize symbol
        btnMax.title = 'Agrandir';
      }
    }
  });
})();

// ── INDIVIDUAL TIMERS ──

function formatTime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map(v => v.toString().padStart(2, '0')).join(':');
}

function updateTimerUI(p) {
  const display = $(`timer-val-${p}`);
  if (display) {
    display.textContent = formatTime(state.timers[p]);
  }
  const btn = $(`btn-timer-toggle-${p}`);
  if (btn) {
    btn.innerHTML = state.timerRunning[p] ? '⏸' : '▶';
    btn.classList.toggle('running', state.timerRunning[p]);
  }
}

function startTimer(p) {
  if (state.timerRunning[p]) return;
  state.timerRunning[p] = true;
  updateTimerUI(p);
  
  if (state.timerIntervals[p]) clearInterval(state.timerIntervals[p]);
  state.timerIntervals[p] = setInterval(() => {
    state.timers[p]++;
    updateTimerUI(p);
    // Periodically save state to prevent losing time on close
    if (state.timers[p] % 5 === 0) {
      saveState();
    }
  }, 1000);
}

function pauseTimer(p) {
  if (!state.timerRunning[p]) return;
  state.timerRunning[p] = false;
  if (state.timerIntervals[p]) {
    clearInterval(state.timerIntervals[p]);
    state.timerIntervals[p] = null;
  }
  updateTimerUI(p);
  saveState();
}

function toggleTimer(p) {
  if (state.timerRunning[p]) {
    pauseTimer(p);
  } else {
    startTimer(p);
  }
}

function resetTimer(p) {
  pauseTimer(p);
  state.timers[p] = 0;
  updateTimerUI(p);
  saveState();
}

function startTimerIfNeeded(p) {
  if (isPlayerLocked(p)) return;
  if (!state.timerRunning[p]) {
    startTimer(p);
  }
}

// Bind timer controls
[1, 2].forEach(p => {
  const toggleBtn = $(`btn-timer-toggle-${p}`);
  const resetBtn = $(`btn-timer-reset-${p}`);
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (isPlayerLocked(p)) return;
      toggleTimer(p);
      broadcastState();
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (isPlayerLocked(p)) return;
      const confirmed = await showCustomConfirm(`Réinitialiser le chrono de ${$(`name-${p}`).value || 'Joueur ' + p} ?`);
      if (confirmed) {
        resetTimer(p);
        broadcastState();
      }
    });
  }
});


// ── CTRL + WHEEL & KEYBOARD ZOOM CONTROLS ──
(function initZoomControls() {
  // Ctrl + Mousewheel zoom
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      let zoom = (window.electronAPI && window.electronAPI.getZoom) ? window.electronAPI.getZoom() : 1.0;
      if (e.deltaY < 0) {
        zoom = Math.min(zoom + 0.05, 3.0); // max zoom 300%
      } else {
        zoom = Math.max(zoom - 0.05, 0.3); // min zoom 30%
      }
      if (window.electronAPI && window.electronAPI.setZoom) {
        window.electronAPI.setZoom(zoom);
      }
    }
  }, { passive: false });

  // Ctrl + keyboard hotkeys zoom
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
      let zoom = (window.electronAPI && window.electronAPI.getZoom) ? window.electronAPI.getZoom() : 1.0;
      if (e.key === '+' || e.key === '=' || e.keyCode === 107) { // ctrl + or ctrl numpad+
        e.preventDefault();
        zoom = Math.min(zoom + 0.05, 3.0);
        if (window.electronAPI && window.electronAPI.setZoom) window.electronAPI.setZoom(zoom);
      }
      if (e.key === '-' || e.keyCode === 109) { // ctrl - or ctrl numpad-
        e.preventDefault();
        zoom = Math.max(zoom - 0.05, 0.3);
        if (window.electronAPI && window.electronAPI.setZoom) window.electronAPI.setZoom(zoom);
      }
      if (e.key === '0' || e.keyCode === 96) { // ctrl 0
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.setZoom) window.electronAPI.setZoom(1.0);
      }
    }
  });
})();

// ── CUSTOM ASYNC DIALOG SYSTEM ──
function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const modal = $('modal-dialog');
    const msgEl = $('dialog-message');
    const btnCancel = $('btn-dialog-cancel');
    const btnConfirm = $('btn-dialog-confirm');
    
    msgEl.textContent = message;
    modal.classList.remove('hidden');
    btnCancel.style.display = 'inline-block'; // Show cancel button
    
    const cleanup = (value) => {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      resolve(value);
    };
    
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
  });
}

function showCustomAlert(message) {
  return new Promise((resolve) => {
    const modal = $('modal-dialog');
    const msgEl = $('dialog-message');
    const btnCancel = $('btn-dialog-cancel');
    const btnConfirm = $('btn-dialog-confirm');
    
    msgEl.textContent = message;
    modal.classList.remove('hidden');
    btnCancel.style.display = 'none'; // Hide cancel button for alert
    
    const cleanup = () => {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      resolve();
    };
    
    function onConfirm() { cleanup(); }
    
    btnConfirm.addEventListener('click', onConfirm);
  });
}

// Force window focus recovery to guarantee keyboard inputs never get frozen under Electron
window.addEventListener('focus', () => {
  document.body.focus();
});


