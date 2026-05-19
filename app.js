// ── STATE ──
const state = {
  streams:{1:null,2:null,3:null}, mirrored:{1:false,2:false,3:false}, fpsIv:{1:null,2:null,3:null},
  picker:{player:null,slot:null},
  shinys:{1:[null,null,null,null,null,null],2:[null,null,null,null,null,null],3:[null,null,null,null,null,null]},
  allPokemon:[], streamMode:false,
  // Compteur shiny
  counts:{1:0, 2:0, 3:0},
  steps:{1:1, 2:1, 3:1},
  huntPoke:{1:null, 2:null, 3:null},
  pickerMode:'shiny', // 'shiny' | 'hunt'
  localRole:'both', // 'hg' | 'ss' | 'both'
  // Timers individuels
  timers:{1:0, 2:0, 3:0},
  timerRunning:{1:false, 2:false, 3:false},
  timerIntervals:{1:null, 2:null, 3:null},
  // Câble Link / PeerJS variables
  peer:null,
  conn:null, // for joiners
  conn2:null, // for host (connection to Player 2)
  conn3:null, // for host (connection to Player 3)
  activeCall:null,
  roomCode:null,
  peerRole:null, // 'host' | 'joiner-2' | 'joiner-3'
  hasPlayer3:false, // dynamic 3rd player
};


const $=id=>document.getElementById(id);
const splash=$('splash-screen'),app=$('app');

// ── LAUNCHER & AUTO-UPDATER ──
const CURRENT_VERSION = 'v2.5';
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

  // Dynamic Video Background Update
  updateVideoBackground(mode);
}

// ── HIGH-FIDELITY DYNAMIC VIDEO BACKGROUND CONTROLLER ──
async function updateVideoBackground(mode) {
  const localVideo = $('bg-video-local');
  const localSource = $('bg-video-source');
  const ytPlayer = $('bg-video-youtube');
  if (!localVideo || !ytPlayer) return;

  const localPaths = {
    'solo-hg': 'assets/solo-hg.mp4',
    'solo-ss': 'assets/solo-ss.mp4',
    'duo-vs': 'assets/duo-vs.mp4'
  };

  const ytVideoIds = {
    'solo-hg': '11d_gKmgOms', // HeartGold Ho-Oh fire opening cinematic
    'solo-ss': 'Lq0A83O4Rko', // SoulSilver Lugia water opening cinematic
    'duo-vs': '1Fh-k8-w90k'   // Combined title screens looping sequence
  };

  const targetLocalPath = localPaths[mode] || localPaths['duo-vs'];
  const targetYtId = ytVideoIds[mode] || ytVideoIds['duo-vs'];

  // Test local reachability asynchronously
  let hasLocalFile = false;
  try {
    const check = await fetch(targetLocalPath, { method: 'HEAD' });
    if (check.ok) {
      hasLocalFile = true;
    }
  } catch(e) {
    // Silent catch, fallback to online stream
  }

  if (hasLocalFile) {
    // Disable and hide YouTube Player
    ytPlayer.src = '';
    ytPlayer.classList.add('hidden');

    // Setup and trigger local video playback
    if (!localSource.src.endsWith(targetLocalPath)) {
      localSource.src = targetLocalPath;
      localVideo.load();
    }
    localVideo.classList.remove('hidden');
    localVideo.play().catch(e => console.warn('Local background autoplay rejected:', e));
  } else {
    // Pause and hide local video
    localVideo.pause();
    localVideo.classList.add('hidden');

    // Build optimized, looping, silent YouTube embed URL
    const ytUrl = `https://www.youtube.com/embed/${targetYtId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${targetYtId}&showinfo=0&rel=0&iv_load_policy=3&enablejsapi=1&modestbranding=1`;
    
    if (ytPlayer.src !== ytUrl) {
      ytPlayer.src = ytUrl;
    }
    ytPlayer.classList.remove('hidden');
  }
}

// ── WEB AUDIO SYNTHESIZERS FOR RETRO SOUND EFFECTS ──
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playPokeballShakeSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    
    const time = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
    
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.15);
  } catch(e) { console.warn('Audio failed:', e); }
}

function playPokeballOpenSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    
    const time = ctx.currentTime;
    
    // Sweep sound (Upward laser/explosion)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(1800, time + 0.35);
    
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
    
    // Noise blast (energy explosion release)
    const bufferSize = ctx.sampleRate * 0.3; // 0.3 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(800, time);
    noiseFilter.frequency.exponentialRampToValueAtTime(300, time + 0.3);
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noise.start(time);
    noise.stop(time + 0.3);
  } catch(e) { console.warn('Audio failed:', e); }
}

function launchApp() {
  // Fade out splash launcher nicely
  splash.classList.add('fade-out');
  
  // Show the PokéBall transition overlay
  const pbTransition = $('pokeball-transition');
  const pbWrap = $('pb-wrap');
  const pbFlash = $('pb-flash');
  const pbLaser = $('pb-laser');
  
  if (pbTransition && pbWrap && pbFlash && pbLaser) {
    pbTransition.classList.remove('hidden');
    pbWrap.classList.add('pb-glowing');
    
    // T = 200ms: First Shake
    setTimeout(() => {
      pbWrap.classList.add('pb-shaking');
      playPokeballShakeSound();
    }, 200);
    
    // T = 800ms: Clear shake
    setTimeout(() => {
      pbWrap.classList.remove('pb-shaking');
    }, 800);
    
    // T = 1000ms: Second Shake
    setTimeout(() => {
      pbWrap.classList.add('pb-shaking');
      playPokeballShakeSound();
    }, 1000);
    
    // T = 1600ms: Clear shake
    setTimeout(() => {
      pbWrap.classList.remove('pb-shaking');
    }, 1600);
    
    // T = 1800ms: EXPLOSION / OPENING!
    setTimeout(() => {
      pbWrap.classList.add('pb-open');
      pbFlash.classList.add('active');
      pbLaser.classList.add('active');
      playPokeballOpenSound();
    }, 1800);
    
    // T = 2500ms: Fade out overlay, scale up main app
    setTimeout(() => {
      pbTransition.classList.add('fade-out');
      splash.classList.add('hidden');
      app.classList.remove('hidden');
      
      initCams();
      loadPokemon();
      restoreState();
    }, 2500);
    
    // T = 3300ms: Clean up transition overlay completely
    setTimeout(() => {
      pbTransition.classList.add('hidden');
      pbTransition.classList.remove('fade-out');
      pbWrap.classList.remove('pb-open', 'pb-glowing', 'pb-shaking');
      pbFlash.classList.remove('active');
      pbLaser.classList.remove('active');
    }, 3300);
  } else {
    // Fallback if elements aren't loaded
    splash.classList.add('hidden');
    app.classList.remove('hidden');
    initCams();
    loadPokemon();
    restoreState();
  }
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

// ── CRYSTAL 3RD PLAYER DYNAMIC CONTROLLER ──
function setPlayer3Active(active) {
  state.hasPlayer3 = active;
  const panel = $('player-panel-3');
  const divider = $('divider-2-3');
  const addCard = $('add-player-card');
  const shinySec = $('shiny-section-3');
  const shinySep = $('sidebar-sep-2-3');
  
  if (active) {
    if (panel) panel.classList.remove('hidden');
    if (divider) divider.classList.remove('hidden');
    if (addCard) addCard.classList.add('hidden');
    if (shinySec) shinySec.classList.remove('hidden');
    if (shinySep) shinySep.classList.remove('hidden');
  } else {
    if (state.streams[3]) {
      stopCam(3);
    }
    if (panel) panel.classList.add('hidden');
    if (divider) divider.classList.add('hidden');
    if (addCard) addCard.classList.remove('hidden');
    if (shinySec) shinySec.classList.add('hidden');
    if (shinySep) shinySep.classList.add('hidden');
  }
  saveState();
}

if ($('add-player-card')) {
  $('add-player-card').addEventListener('click', () => {
    setPlayer3Active(true);
  });
}

if ($('btn-close-player-3')) {
  $('btn-close-player-3').addEventListener('click', async () => {
    const confirmed = await showCustomConfirm("Retirer le joueur 3 du lobby ?");
    if (confirmed) {
      setPlayer3Active(false);
    }
  });
}

// ── CAMERAS ──
async function initCams(){
  try{
    await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    const devs=await navigator.mediaDevices.enumerateDevices();
    fillSelects(devs.filter(d=>d.kind==='videoinput'));
  }catch(e){console.warn(e);}
}
function fillSelects(devs){
  [1,2,3].forEach(p=>{
    const sel=$(`camera-select-${p}`);
    if(!sel) return;
    sel.innerHTML='<option value="">Caméra...</option>';
    devs.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Caméra ${i+1}`;sel.appendChild(o);});
    if(devs[p-1])sel.value=devs[p-1].deviceId;
  });
}
navigator.mediaDevices.addEventListener('devicechange',async()=>{
  fillSelects((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));
});
[1,2,3].forEach(p=>{
  const camBtn = $(`btn-cam-${p}`);
  const mirBtn = $(`btn-mirror-${p}`);
  const selEl = $(`camera-select-${p}`);
  if(camBtn) camBtn.addEventListener('click',()=>toggleCam(p));
  if(mirBtn) mirBtn.addEventListener('click',()=>toggleMirror(p));
  if(selEl) selEl.addEventListener('change',()=>{if(state.streams[p])startCam(p);});
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
  [1,2,3].forEach(p=>{
    const nameEl = $(`name-${p}`);
    const labelEl = $(`shiny-label-${p}`);
    if (nameEl && labelEl) {
      const suffix = p === 1 ? 'HeartGold' : p === 2 ? 'SoulSilver' : 'Crystal';
      labelEl.textContent = `${nameEl.value || 'Joueur ' + p} — ${suffix}`;
    }
  });
  saveState();
  broadcastState();
}
$('name-1').addEventListener('input',syncLabels);
$('name-2').addEventListener('input',syncLabels);
if($('name-3')) $('name-3').addEventListener('input',syncLabels);

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
  if(e.key==='1')toggleCam(1);if(e.key==='2')toggleCam(2);if(e.key==='3')toggleCam(3);
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
[1,2,3].forEach(p=>{
  const plusBtn = $(`btn-plus-${p}`);
  const minusBtn = $(`btn-minus-${p}`);
  const rstBtn = $(`btn-reset-${p}`);
  const stepIn = $(`step-input-${p}`);
  const huntBtn = $(`btn-pick-hunt-${p}`);

  if (plusBtn) plusBtn.addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    startTimerIfNeeded(p);
    state.counts[p]=Math.max(0,state.counts[p]+state.steps[p]);
    updateCounterUI(p);saveState();broadcastState();
  });
  if (minusBtn) minusBtn.addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    startTimerIfNeeded(p);
    state.counts[p]=Math.max(0,state.counts[p]-state.steps[p]);
    updateCounterUI(p);saveState();broadcastState();
  });
  if (rstBtn) rstBtn.addEventListener('click',async()=>{
    if(isPlayerLocked(p)) return;
    const nameVal = $(`name-${p}`) ? $(`name-${p}`).value : '';
    const confirmed = await showCustomConfirm(`Remettre le compteur de ${nameVal||'Joueur '+p} à 0 ?`);
    if(confirmed){
      state.counts[p]=0;updateCounterUI(p);saveState();broadcastState();
    }
  });
  document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(isPlayerLocked(p)) return;
      const v=parseInt(btn.dataset.val)||1;
      state.steps[p]=v;
      if ($(`step-input-${p}`)) $(`step-input-${p}`).value=v;
      document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      saveState();broadcastState();
    });
  });
  if (stepIn) stepIn.addEventListener('input',e=>{
    if(isPlayerLocked(p)) return;
    const v=Math.max(1,parseInt(e.target.value)||1);
    state.steps[p]=v;
    document.querySelectorAll(`.btn-step-preset[data-player="${p}"]`).forEach(b=>b.classList.remove('active'));
    saveState();broadcastState();
  });
  if (huntBtn) huntBtn.addEventListener('click',()=>{
    if(isPlayerLocked(p)) return;
    openHuntPicker(p);
  });
});

// ── PERSISTANCE LOCALSTORAGE ──
const SAVE_KEY='hgss-stream-save-v1';

function saveState(){
  const data={
    names:{1:$('name-1').value,2:$('name-2').value,3:$('name-3') ? $('name-3').value : ''},
    counts:state.counts,
    steps:state.steps,
    shinys:state.shinys,
    huntPoke:state.huntPoke,
    localRole:state.localRole,
    timers:state.timers,
    hasPlayer3:state.hasPlayer3
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
      [1,2,3].forEach(p=>{
        if(data.names[p] && $(`name-${p}`)){
          $(`name-${p}`).value=data.names[p];
        }
      });
      syncLabels();
    }
    // Compteurs
    if(data.counts) state.counts={1:data.counts[1]||0,2:data.counts[2]||0,3:data.counts[3]||0};
    // Steps
    if(data.steps){
      state.steps={1:data.steps[1]||1,2:data.steps[2]||1,3:data.steps[3]||1};
      [1,2,3].forEach(p=>{
        if ($(`step-input-${p}`)) $(`step-input-${p}`).value=state.steps[p];
      });
    }
    // Shinys collection
    if(data.shinys){
      [1,2,3].forEach(p=>{
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
      [1,2,3].forEach(p=>{
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
      state.timers = { 1: data.timers[1] || 0, 2: data.timers[2] || 0, 3: data.timers[3] || 0 };
    }
    [1, 2, 3].forEach(p => {
      if ($(`timer-val-${p}`)) updateTimerUI(p);
    });

    // Update counter displays
    [1,2,3].forEach(p=>{
      if ($(`count-val-${p}`)) updateCounterUI(p);
    });

    // Restore Player 3 active state
    if (data.hasPlayer3) {
      setPlayer3Active(true);
    } else {
      setPlayer3Active(false);
    }
  }catch(e){console.warn('Restore failed:',e);}
}

// ── MULTIPLAYER LINK CABLE SYSTEM (PEERJS) ──

// Broadcasts our local state to our connected peer(s)
function broadcastState() {
  if (!state.peerRole) return;
  const isHost = state.peerRole === 'host';
  const localPlayer = isHost ? 1 : (state.peerRole === 'joiner-2' ? 2 : 3);
  
  const payload = {
    type: 'state-sync',
    role: state.peerRole,
    name: $(`name-${localPlayer}`).value,
    count: state.counts[localPlayer],
    huntPoke: state.huntPoke[localPlayer],
    shinys: state.shinys[localPlayer],
    timer: state.timers[localPlayer],
    timerRunning: state.timerRunning[localPlayer]
  };

  if (isHost) {
    if (state.conn2 && state.conn2.open) state.conn2.send(payload);
    if (state.conn3 && state.conn3.open) state.conn3.send(payload);
    
    // Broadcast active status of Player 3
    const p3Active = !$('player-panel-3').classList.contains('hidden');
    const activePayload = { type: 'player3-active', active: p3Active };
    if (state.conn2 && state.conn2.open) state.conn2.send(activePayload);
    if (state.conn3 && state.conn3.open) state.conn3.send(activePayload);
  } else {
    if (state.conn && state.conn.open) {
      state.conn.send(payload);
    }
  }
}

// Triggers or updates the WebRTC video exchange
function updateMediaCall() {
  if (!state.peer) return;

  if (state.peerRole === 'joiner-2' || state.peerRole === 'joiner-3') {
    if (state.activeCall) {
      state.activeCall.close();
      state.activeCall = null;
    }
    const localP = state.peerRole === 'joiner-2' ? 2 : 3;
    const myStream = state.streams[localP];
    if (myStream) {
      const call = state.peer.call('hgss-' + state.roomCode, myStream);
      state.activeCall = call;
      setupCallListeners(call);
    } else {
      if (state.conn && state.conn.open) {
        state.conn.send({ type: 'camera-off', player: localP });
      }
    }
  } else if (state.peerRole === 'host') {
    if (state.conn2 && state.conn2.open) state.conn2.send({ type: 'camera-update' });
    if (state.conn3 && state.conn3.open) state.conn3.send({ type: 'camera-update' });
  }
}

// Setup common call stream receivers
function setupCallListeners(call) {
  call.on('stream', remoteStream => {
    let remotePlayer = 2;
    if (state.peerRole === 'host') {
      if (state.conn2 && call.peer === state.conn2.peer) {
        remotePlayer = 2;
      } else if (state.conn3 && call.peer === state.conn3.peer) {
        remotePlayer = 3;
      }
    } else {
      remotePlayer = 1;
    }

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
    let remotePlayer = 2;
    if (state.peerRole === 'host') {
      if (state.conn2 && call.peer === state.conn2.peer) remotePlayer = 2;
      else if (state.conn3 && call.peer === state.conn3.peer) remotePlayer = 3;
    } else {
      remotePlayer = 1;
    }
    stopRemoteCamera(remotePlayer);
  });
}

function stopRemoteCamera(p) {
  const vid = $(`video-${p}`);
  if (vid) vid.srcObject = null;
  const signal = $(`no-signal-${p}`);
  if (signal) signal.classList.remove('hidden');
  const btn = $(`btn-cam-${p}`);
  if (btn) btn.classList.remove('active');
  const s = $(`status-${p}`);
  if (s) {
    s.textContent = 'OFF';
    s.className = 's-off';
  }
  const res = $(`res-${p}`);
  if (res) res.textContent = '—';
  const fps = $(`fps-${p}`);
  if (fps) fps.textContent = '—';
}

// Lock/unlock UI elements depending on role
function updateUILocks() {
  const isMulti = !!(state.conn || state.conn2 || state.conn3);
  const isHost = state.peerRole === 'host';
  const isJoiner2 = state.peerRole === 'joiner-2';
  const isJoiner3 = state.peerRole === 'joiner-3';

  let lock1 = false;
  let lock2 = false;
  let lock3 = false;

  if (isMulti) {
    if (isHost) {
      lock1 = false;
      lock2 = true;
      lock3 = true;
    } else if (isJoiner2) {
      lock1 = true;
      lock2 = false;
      lock3 = true;
    } else if (isJoiner3) {
      lock1 = true;
      lock2 = true;
      lock3 = false;
    }
  } else {
    lock1 = state.localRole === 'ss';
    lock2 = state.localRole === 'hg';
    lock3 = false; // Always unlocked locally
  }

  $(`name-1`).disabled = lock1;
  $(`name-2`).disabled = lock2;
  $(`name-3`).disabled = lock3;
  
  $(`camera-select-1`).disabled = lock1;
  $(`camera-select-2`).disabled = lock2;
  $(`camera-select-3`).disabled = lock3;

  [1, 2, 3].forEach(p => {
    const locked = p === 1 ? lock1 : (p === 2 ? lock2 : lock3);
    
    const counter = $(`counter-${p}`);
    if (counter) {
      counter.classList.toggle('locked-ui', locked);
    }

    document.querySelectorAll(`.shiny-slot[data-player="${p}"]`).forEach(s => {
      s.classList.toggle('locked-ui', locked);
    });

    const btnCam = $(`btn-cam-${p}`);
    const btnMirror = $(`btn-mirror-${p}`);
    if (btnCam) btnCam.classList.toggle('locked-ui', locked);
    if (btnMirror) btnMirror.classList.toggle('locked-ui', locked);

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
    let p = 1;
    if (data.role === 'host') p = 1;
    else if (data.role === 'joiner-2') p = 2;
    else if (data.role === 'joiner-3') p = 3;
    else p = data.role === 'joiner' ? 2 : 1;

    $(`name-${p}`).value = data.name || '';
    const consoleName = p === 1 ? 'HeartGold' : (p === 2 ? 'SoulSilver' : 'Crystal');
    $(`shiny-label-${p}`).textContent = `${data.name || 'Joueur '+p} — ${consoleName}`;
    
    state.counts[p] = data.count || 0;
    updateCounterUI(p);
    
    state.huntPoke[p] = data.huntPoke || null;
    renderHuntPoke(p);
    
    if (data.shinys) {
      state.shinys[p] = data.shinys;
      state.shinys[p].forEach((poke, slot) => {
        renderShinySlot(p, slot);
      });
    }

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

    // Host relays guest state updates to the other guest!
    if (state.peerRole === 'host') {
      if (data.role === 'joiner-2' && state.conn3 && state.conn3.open) {
        state.conn3.send(data);
      } else if (data.role === 'joiner-3' && state.conn2 && state.conn2.open) {
        state.conn2.send(data);
      }
    }

    saveState();
  } else if (data.type === 'player3-active') {
    if (state.peerRole !== 'host') {
      setPlayer3Active(data.active);
    }
  } else if (data.type === 'camera-update') {
    updateMediaCall();
  } else if (data.type === 'camera-off') {
    stopRemoteCamera(data.player);
  } else if (data.type === 'screamer-trigger') {
    triggerLocalScreamer();
  }
}

$('btn-lc-host').addEventListener('click', () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  state.roomCode = code;
  state.peerRole = 'host';
  
  statusLight.className = 'lc-status-dot hosting';
  statusText.textContent = 'En attente...';
  groupOffline.classList.add('hidden');
  groupHosting.classList.remove('hidden');
  myCodeDisplay.textContent = code;

  state.peer = new Peer('hgss-' + code);
  
  state.peer.on('open', () => {
    console.log('Host Peer opened with ID: hgss-' + code);
  });

  state.peer.on('connection', conn => {
    // Dynamically assign connections
    if (!state.conn2 || !state.conn2.open) {
      state.conn2 = conn;
      conn.on('open', () => {
        conn.send({ type: 'assign-role', role: 'joiner-2' });
        setupConnection(conn, 2);
      });
    } else if (!state.conn3 || !state.conn3.open) {
      state.conn3 = conn;
      conn.on('open', () => {
        conn.send({ type: 'assign-role', role: 'joiner-3' });
        setPlayer3Active(true);
        if (state.conn2 && state.conn2.open) {
          state.conn2.send({ type: 'player3-active', active: true });
        }
        setupConnection(conn, 3);
      });
    } else {
      conn.on('open', () => {
        conn.send({ type: 'lobby-full' });
        setTimeout(() => conn.close(), 1000);
      });
    }
  });

  state.peer.on('call', call => {
    state.activeCall = call;
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
  state.peerRole = 'joiner-2'; // initial default, will be overridden by host assignment

  statusLight.className = 'lc-status-dot hosting';
  statusText.textContent = 'Connexion...';
  groupOffline.classList.add('hidden');
  groupHosting.classList.add('hidden');
  
  state.peer = new Peer();
  
  state.peer.on('open', () => {
    console.log('Joiner Peer opened');
    const conn = state.peer.connect('hgss-' + code);
    state.conn = conn;
    
    conn.on('data', data => {
      if (data.type === 'assign-role') {
        state.peerRole = data.role;
        console.log('Assigned role by host:', state.peerRole);
        updateUILocks();
        broadcastState();
      } else if (data.type === 'lobby-full') {
        showCustomAlert('Le lobby est plein (maximum 3 joueurs) !');
        disconnectMultiplayer();
      } else {
        handleDataMessage(data);
      }
    });

    conn.on('open', () => {
      statusLight.className = 'lc-status-dot connected';
      statusText.textContent = 'Câble branché';
      groupOffline.classList.add('hidden');
      groupHosting.classList.add('hidden');
      groupConnected.classList.remove('hidden');

      updateUILocks();
      updateMediaCall();
    });

    conn.on('close', () => {
      disconnectMultiplayer();
    });
  });

  state.peer.on('call', call => {
    state.activeCall = call;
    const localP = state.peerRole === 'joiner-2' ? 2 : 3;
    call.answer(state.streams[localP] || undefined);
    setupCallListeners(call);
  });

  state.peer.on('error', err => {
    showCustomAlert('Impossible de rejoindre cette partie. Vérifie le code !');
    disconnectMultiplayer();
  });
});

function setupConnection(conn, playerNum) {
  conn.on('open', () => {
    statusLight.className = 'lc-status-dot connected';
    statusText.textContent = 'Câble branché';
    groupOffline.classList.add('hidden');
    groupHosting.classList.add('hidden');
    groupConnected.classList.remove('hidden');

    updateUILocks();
    broadcastState();
    updateMediaCall();
  });

  conn.on('data', data => {
    handleDataMessage(data);
  });

  conn.on('close', () => {
    console.log(`Connection closed for Player ${playerNum}`);
    if (playerNum === 2) {
      state.conn2 = null;
      stopRemoteCamera(2);
    } else if (playerNum === 3) {
      state.conn3 = null;
      stopRemoteCamera(3);
      setPlayer3Active(false);
      if (state.conn2 && state.conn2.open) {
        state.conn2.send({ type: 'player3-active', active: false });
      }
    }

    if ((!state.conn2 || !state.conn2.open) && (!state.conn3 || !state.conn3.open)) {
      statusLight.className = 'lc-status-dot hosting';
      statusText.textContent = 'En attente...';
    }
  });
}

function disconnectMultiplayer() {
  if (state.conn) {
    try { state.conn.close(); } catch(e){}
    state.conn = null;
  }
  if (state.conn2) {
    try { state.conn2.close(); } catch(e){}
    state.conn2 = null;
  }
  if (state.conn3) {
    try { state.conn3.close(); } catch(e){}
    state.conn3 = null;
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

  stopRemoteCamera(1);
  stopRemoteCamera(2);
  stopRemoteCamera(3);
  
  if (state.streams[1]) {
    $('video-1').srcObject = state.streams[1];
    $('no-signal-1').classList.add('hidden');
  }
  if (state.streams[2]) {
    $('video-2').srcObject = state.streams[2];
    $('no-signal-2').classList.add('hidden');
  }
  if (state.streams[3]) {
    $('video-3').srcObject = state.streams[3];
    $('no-signal-3').classList.add('hidden');
  }

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
[1, 2, 3].forEach(p => {
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
      const nameVal = $(`name-${p}`) ? $(`name-${p}`).value : '';
      const confirmed = await showCustomConfirm(`Réinitialiser le chrono de ${nameVal || 'Joueur ' + p} ?`);
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

// ── FNAF SECRET SCREAMER JUMPSCARE ──
function triggerLocalScreamer() {
  const overlay = $('screamer-overlay');
  const video = $('screamer-video');
  if (!overlay || !video) return;

  overlay.classList.remove('hidden');
  video.currentTime = 0;
  
  // Unmute screamer audio
  video.muted = false;
  video.volume = 1.0;
  
  // Play jumpscare video
  video.play().catch(e => {
    console.warn('Screamer playback failed:', e);
    overlay.classList.add('hidden');
  });
}

(function initScreamer() {
  const btn = $('btn-secret-screamer');
  const overlay = $('screamer-overlay');
  const video = $('screamer-video');
  if (!btn || !overlay || !video) return;

  btn.addEventListener('click', () => {
    triggerLocalScreamer();

    // Trigger on connected peer's screen too!
    if (state.conn) {
      try {
        state.conn.send({ type: 'screamer-trigger' });
      } catch (e) {
        console.warn('Failed to send jumpscare trigger to peer:', e);
      }
    }
  });

  video.addEventListener('ended', () => {
    overlay.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
  });

  // Clicking screen immediately closes the screamer
  overlay.addEventListener('click', () => {
    overlay.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
  });
})();


