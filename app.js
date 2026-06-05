const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const STORAGE = {
  token: 'pc_token',
  folder: 'pc_root_folder_id',
  style: 'pc_selected_style',
  stage: 'pc_stage_mode',
  favorites: 'pc_favorites_v1',
  playlists: 'pc_playlists_v1',
  activePlaylist: 'pc_active_playlist',
  library: 'pc_library_cache_v1',
  connected: 'pc_google_connected',
  pdfZoom: 'pc_pdf_zoom'
};

const els = {};
let tokenClient;
let accessToken = '';
let library = [];
let filteredSongs = [];
let currentIndex = -1;
let pickerReady = false;
let gisReady = false;
let gapiReady = false;
let currentAudioObjectUrl = '';
let currentPdfObjectUrl = '';
const FILE_CACHE_NAME = 'playback-cifras-drive-files-v1';
const objectUrlCache = new Map();
const prefetchingFiles = new Set();
let pdfRenderSeq = 0;
let currentPdfMode = 'preview';
let audioLoadSeq = 0;
let autoScrollTimer = null;
let autoScrollSpeed = 1;
let pdfZoom = 1;
let tokenRequestResolve = null;

window.addEventListener('DOMContentLoaded', init);

function init(){
  if(window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  bindEls();
  bindEvents();
  restoreUi();
  registerSW();
  waitForGoogleLibs();
}

function bindEls(){
  ['googleBtn','logoutBtn','loginStatus','folderIdInput','pickFolderBtn','refreshBtn','clearFolderBtn','styleSelect','searchInput','songList','songTitle','songMeta','pdfFrame','pdfScroll','emptyState','audio','prevBtn','nextBtn','playBtn','rewindBtn','forwardBtn','repeatBtn','playlistOpenBtn','seekBar','currentTimeLabel','durationLabel','stageBtn','fullscreenBtn','sidebar','toggleSidebar','showSidebar','toast','favoriteBtn','playlistSelect','newPlaylistBtn','addPlaylistBtn','deletePlaylistBtn','zoomOutBtn','zoomLabel','zoomInBtn','autoScrollBtn','speedDownBtn','speedUpBtn','speedLabel'].forEach(id=>els[id]=document.getElementById(id));
}

function bindEvents(){
  els.googleBtn.addEventListener('click', login);
  els.logoutBtn.addEventListener('click', logout);
  els.pickFolderBtn.addEventListener('click', openPicker);
  els.refreshBtn.addEventListener('click', refreshLibrary);
  els.clearFolderBtn.addEventListener('click', clearFolder);
  els.styleSelect.addEventListener('change',()=>{localStorage.setItem(STORAGE.style,els.styleSelect.value);applyFilters();});
  els.searchInput.addEventListener('input', applyFilters);
  els.prevBtn.addEventListener('click', prevSong);
  els.nextBtn.addEventListener('click', nextSong);
  els.playBtn.addEventListener('click', togglePlay);
  if(els.rewindBtn) els.rewindBtn.addEventListener('click',()=>seekRelative(-10));
  if(els.forwardBtn) els.forwardBtn.addEventListener('click',()=>seekRelative(10));
  if(els.repeatBtn) els.repeatBtn.addEventListener('click',toggleRepeat);
  if(els.playlistOpenBtn) els.playlistOpenBtn.addEventListener('click',()=>els.sidebar.classList.add('open'));
  if(els.seekBar) els.seekBar.addEventListener('input', seekFromBar);
  els.stageBtn.addEventListener('click', toggleStage);
  els.fullscreenBtn.addEventListener('click', fullscreen);
  els.favoriteBtn.addEventListener('click', toggleFavorite);
  els.playlistSelect.addEventListener('change',()=>{localStorage.setItem(STORAGE.activePlaylist, els.playlistSelect.value); applyFilters();});
  els.newPlaylistBtn.addEventListener('click', createPlaylist);
  els.addPlaylistBtn.addEventListener('click', addCurrentToPlaylist);
  els.deletePlaylistBtn.addEventListener('click', deletePlaylist);
  els.zoomOutBtn.addEventListener('click',()=>changePdfZoom(-0.1));
  els.zoomInBtn.addEventListener('click',()=>changePdfZoom(0.1));
  els.autoScrollBtn.addEventListener('click', toggleAutoScroll);
  els.speedDownBtn.addEventListener('click',()=>changeScrollSpeed(-1));
  els.speedUpBtn.addEventListener('click',()=>changeScrollSpeed(1));
  els.showSidebar.addEventListener('click',()=>els.sidebar.classList.add('open'));
  els.toggleSidebar.addEventListener('click',()=>els.sidebar.classList.remove('open'));
  els.audio.addEventListener('play',()=>setPlayButton(true));
  els.audio.addEventListener('pause',()=>setPlayButton(false));
  els.audio.addEventListener('timeupdate', updateTimeline);
  els.audio.addEventListener('loadedmetadata', updateTimeline);
  els.audio.addEventListener('durationchange', updateTimeline);
  els.audio.addEventListener('ended',()=>{setPlayButton(false); updateTimeline();});
  document.addEventListener('keydown', keyboard);
}

function restoreUi(){
  updateLoginUi(localStorage.getItem(STORAGE.connected)==='1');
  const savedFolder = localStorage.getItem(STORAGE.folder) || window.APP_CONFIG?.ROOT_FOLDER_ID || '';
  els.folderIdInput.value = savedFolder;
  if(localStorage.getItem(STORAGE.stage)==='1') document.body.classList.add('stage');
  updateStageBtn();
  loadCachedLibrary();
  renderPlaylists();
  updateSpeedLabel();
  updateZoomLabel();
}


function registerSW(){
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}
}

function waitForGoogleLibs(){
  const timer=setInterval(()=>{
    if(window.google?.accounts?.oauth2 && !gisReady){
      gisReady=true;
      setupTokenClient();
    }
    if(window.gapi && !gapiReady){
      gapiReady=true;
      gapi.load('picker',()=>{pickerReady=true;});
    }
    if(gisReady && gapiReady) clearInterval(timer);
  },200);
}

function setupTokenClient(){
  const clientId = window.APP_CONFIG?.GOOGLE_CLIENT_ID || '';
  if(!clientId || clientId.includes('COLE_SEU_CLIENT_ID')){
    els.loginStatus.textContent = 'Configure o GOOGLE_CLIENT_ID em config.js';
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: async (resp)=>{
      if(resp.error){
        if(tokenRequestResolve){ tokenRequestResolve(false); tokenRequestResolve=null; }
        toast('Erro no login: '+resp.error);
        return;
      }
      accessToken = resp.access_token;
      localStorage.setItem(STORAGE.token, accessToken);
      localStorage.setItem(STORAGE.connected, '1');
      updateLoginUi(true);
      if(tokenRequestResolve){ tokenRequestResolve(true); tokenRequestResolve=null; }
      if(els.folderIdInput.value.trim()) await refreshLibrary(true);
    }
  });

  // Mantém a sessão prática: se o usuário já autorizou antes, tenta renovar silenciosamente.
  // Não guarda senha; apenas reutiliza a sessão Google já ativa no navegador/iPad.
  if(localStorage.getItem(STORAGE.connected)==='1' || localStorage.getItem(STORAGE.folder)){
    setTimeout(()=>requestToken('').catch(()=>{}), 500);
  }
}

async function requestToken(prompt=''){
  if(!tokenClient) return false;
  return new Promise(resolve=>{
    tokenRequestResolve = resolve;
    try{ tokenClient.requestAccessToken({prompt}); }
    catch(err){ console.error(err); tokenRequestResolve=null; resolve(false); }
    setTimeout(()=>{ if(tokenRequestResolve){ tokenRequestResolve=null; tokenRequestResolve=null; resolve(false); } }, 15000);
  });
}

async function login(){
  const ok = await requestToken('consent');
  if(!ok) toast('Não foi possível concluir o login Google.');
}

async function logout(){
  const token = accessToken || localStorage.getItem(STORAGE.token) || '';
  if(token && window.google?.accounts?.oauth2){
    try{ google.accounts.oauth2.revoke(token, ()=>{}); }catch{}
  }
  accessToken = '';
  localStorage.removeItem(STORAGE.token);
  localStorage.removeItem(STORAGE.connected);
  updateLoginUi(false);
  toast('Login Google removido deste dispositivo.');
}

function updateLoginUi(connected){
  els.loginStatus.textContent = connected ? 'Google conectado' : 'Desconectado';
  els.googleBtn.textContent = connected ? 'Reconectar Google' : 'Entrar com Google';
  if(els.logoutBtn) els.logoutBtn.style.display = connected ? 'block' : 'none';
}

async function ensureLogin(){
  if(accessToken) return true;
  if(localStorage.getItem(STORAGE.connected)==='1'){
    const ok = await requestToken('');
    if(ok) return true;
  }
  toast('Entre com Google primeiro.');
  return false;
}

function authHeaders(){ return {Authorization:`Bearer ${accessToken}`}; }

async function fetchWithAuth(url, options={}, retry=true){
  if(!accessToken && localStorage.getItem(STORAGE.connected)==='1'){
    await requestToken('');
  }
  const res = await fetch(url, {...options, headers:{...(options.headers||{}), ...authHeaders()}});
  if(res.status === 401 && retry){
    const ok = await requestToken('');
    if(ok) return fetchWithAuth(url, options, false);
  }
  return res;
}

async function driveList(params){
  const url = new URL(DRIVE_FILES);
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') url.searchParams.set(k,v); });
  const res = await fetchWithAuth(url.toString());
  if(!res.ok){
    const txt = await res.text();
    throw new Error(`Erro Drive ${res.status}: ${txt}`);
  }
  return res.json();
}

async function driveGet(fileId, fields='id,name,mimeType'){
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', fields);
  const res = await fetchWithAuth(url.toString());
  if(!res.ok){
    const txt = await res.text();
    throw new Error(`Erro Drive ${res.status}: ${txt}`);
  }
  return res.json();
}

async function listAll(params){
  let files=[]; let pageToken='';
  do{
    const data = await driveList({...params, pageToken});
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  }while(pageToken);
  return files;
}

async function refreshLibrary(silent=false){
  if(!(await ensureLogin())) return;
  const rootId = extractFolderId(els.folderIdInput.value.trim());
  if(!rootId){ toast('Informe ou selecione uma pasta do Drive.'); return; }
  els.folderIdInput.value = rootId;
  localStorage.setItem(STORAGE.folder, rootId);
  if(!silent) toast('Atualizando biblioteca...');
  try{
    const root = await driveGet(rootId, 'id,name,mimeType');
    if(root.mimeType !== 'application/vnd.google-apps.folder'){
      toast('O ID informado não é de uma pasta do Drive.');
      return;
    }

    const result=[];

    // Cenário B: a própria pasta escolhida já contém PDFs e MP3s.
    const rootFiles = await listAll({
      q: `'${rootId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='audio/mpeg' or name contains '.mp3')`,
      fields:'nextPageToken, files(id,name,mimeType,webViewLink,webContentLink)',
      orderBy:'name',
      pageSize:'1000'
    });
    result.push(...pairFiles({id:root.id, name:root.name}, rootFiles));

    // Cenário A: a pasta principal contém subpastas por estilo.
    const styles = await listAll({
      q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields:'nextPageToken, files(id,name,mimeType)',
      orderBy:'name',
      pageSize:'1000'
    });
    const styleResults = await Promise.all(styles.map(async style=>{
      const files = await listAll({
        q: `'${style.id}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='audio/mpeg' or name contains '.mp3')`,
        fields:'nextPageToken, files(id,name,mimeType,webViewLink,webContentLink)',
        orderBy:'name',
        pageSize:'1000'
      });
      return pairFiles(style, files);
    }));
    for(const songs of styleResults) result.push(...songs);

    library = dedupeSongs(result).sort((a,b)=>a.style.localeCompare(b.style,'pt-BR') || a.title.localeCompare(b.title,'pt-BR'));
    localStorage.setItem(STORAGE.library, JSON.stringify(library));
    renderStyles();
    applyFilters();
    if(library.length){
      toast(`Biblioteca atualizada: ${library.length} música(s).`);
    }else{
      toast('Nenhum par PDF + MP3 encontrado. Confira se os nomes dos arquivos são iguais.');
    }
  }catch(err){
    console.error(err);
    toast('Erro ao acessar o Drive. Confira a pasta e as permissões.');
  }
}

function dedupeSongs(songs){
  const seen = new Set();
  return songs.filter(song=>{
    const key = `${song.styleId}|${song.title}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pairFiles(style, files){
  const map = new Map();
  for(const file of files){
    const ext = getExt(file.name);
    if(ext !== 'pdf' && ext !== 'mp3') continue;
    const base = normalizeBase(file.name);
    const key = normalizeMatchKey(base);
    if(!map.has(key)) map.set(key,{title:base,style:style.name,styleId:style.id});
    const item = map.get(key);
    if(ext==='pdf') item.pdf = file;
    if(ext==='mp3') item.mp3 = file;
  }
  return [...map.values()].filter(x=>x.pdf && x.mp3).map(x=>({
    title:x.title,
    style:x.style,
    styleId:x.styleId,
    pdfId:x.pdf.id,
    mp3Id:x.mp3.id,
    pdfUrl:`https://www.googleapis.com/drive/v3/files/${x.pdf.id}?alt=media`,
    mp3Url:`https://www.googleapis.com/drive/v3/files/${x.mp3.id}?alt=media`
  }));
}


function loadCachedLibrary(){
  try{
    const cached = JSON.parse(localStorage.getItem(STORAGE.library) || '[]');
    if(Array.isArray(cached) && cached.length){
      library = cached;
      renderStyles();
      applyFilters();
      toast('Biblioteca salva carregada. Entre com Google para sincronizar.');
    }
  }catch{}
}

function renderStyles(){
  const styles = [...new Set(library.map(s=>s.style))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const saved = localStorage.getItem(STORAGE.style);
  els.styleSelect.innerHTML = '<option value="">Todos os estilos</option><option value="__favorites">⭐ Favoritas</option>' + styles.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if(saved && (styles.includes(saved) || saved === '__favorites')) els.styleSelect.value = saved;
}

function applyFilters(){
  const style = els.styleSelect.value;
  const playlist = els.playlistSelect.value;
  const q = removeAccents(els.searchInput.value.trim().toLowerCase());
  const favs = getFavorites();
  const playlists = getPlaylists();
  filteredSongs = library.filter(s=>{
    const key = songKey(s);
    const okStyle = !style || (style === '__favorites' ? favs.includes(key) : s.style===style);
    const okPlaylist = !playlist || (playlists[playlist]||[]).includes(key);
    const okSearch = !q || removeAccents(s.title.toLowerCase()).includes(q);
    return okStyle && okPlaylist && okSearch;
  });
  renderSongs();
  if(filteredSongs.length){ loadSong(Math.max(0, Math.min(currentIndex, filteredSongs.length-1)), false); }
  else { clearCurrent(); }
}

function renderSongs(){
  els.songList.innerHTML = filteredSongs.map((s,i)=>`<div class="song-item ${i===currentIndex?'active':''}" data-index="${i}"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.style)}</span></div>`).join('');
  els.songList.querySelectorAll('.song-item').forEach(el=>el.addEventListener('click',()=>{loadSong(Number(el.dataset.index), true); els.sidebar.classList.remove('open');}));
}

async function loadSong(index, autoplay=false){
  if(index<0 || index>=filteredSongs.length) return;
  currentIndex=index;
  const seq = ++audioLoadSeq;
  const song = filteredSongs[index];

  els.songTitle.textContent = song.title;
  els.songMeta.textContent = `${song.style} • ${index+1} de ${filteredSongs.length} • abrindo PDF...`;
  updateFavoriteButton();
  stopAutoScroll(false);
  els.emptyState.style.display = 'none';
  renderSongs();

  resetAudioSource();
  resetPdfSource();

  try{
    // O PDF aparece imediatamente pelo preview do Drive. Antes, o app esperava o MP3 baixar
    // para só então exibir o PDF; isso deixava a troca de música com sensação de lentidão.
    setPreviewPdf(getDrivePreviewUrl(song.pdfId));
    els.songMeta.textContent = `${song.style} • ${index+1} de ${filteredSongs.length} • preparando áudio...`;

    const audioUrl = await getAuthorizedFileObjectUrl(song.mp3Id, 'audio');
    if(seq !== audioLoadSeq) return;
    els.audio.src = audioUrl;
    els.audio.load();
    els.songMeta.textContent = `${song.style} • ${index+1} de ${filteredSongs.length}`;
    if(autoplay){
      setTimeout(()=>els.audio.play().catch(()=>{}),180);
    }
    updateFavoriteButton();
    prefetchAround(index);
  }catch(err){
    console.error(err);
    if(seq === audioLoadSeq){
      els.songMeta.textContent = `${song.style} • ${index+1} de ${filteredSongs.length} • erro ao carregar áudio`;
      toast('PDF aberto. Não consegui carregar o MP3. Confira permissões e conexão.');
    }
  }
}

function getDrivePreviewUrl(fileId){
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

async function getAuthorizedFileObjectUrl(fileId, kind){
  const cached = objectUrlCache.get(fileId);
  if(cached){
    cached.usedAt = Date.now();
    return cached.url;
  }

  const blob = await getDriveBlobCached(fileId);
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(fileId, {url, kind, usedAt:Date.now()});
  trimObjectUrlCache();
  return url;
}

async function getDriveBlobCached(fileId){
  const cacheKey = new Request(`${location.origin}${location.pathname.replace(/[^/]*$/, '')}__drive_file_cache__/${encodeURIComponent(fileId)}`);

  if('caches' in window){
    try{
      const cache = await caches.open(FILE_CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if(cached) return await cached.blob();
    }catch(err){ console.warn('Cache local indisponível:', err); }
  }

  const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if(!res.ok){
    const txt = await res.text();
    throw new Error(`Erro ao baixar arquivo ${res.status}: ${txt}`);
  }
  const blob = await res.blob();

  if('caches' in window){
    try{
      const cache = await caches.open(FILE_CACHE_NAME);
      cache.put(cacheKey, new Response(blob, {headers:{'Content-Type': blob.type || 'application/octet-stream'}}));
    }catch(err){ console.warn('Não consegui salvar arquivo no cache local:', err); }
  }
  return blob;
}

function trimObjectUrlCache(){
  const max = 6;
  if(objectUrlCache.size <= max) return;
  const entries = [...objectUrlCache.entries()].sort((a,b)=>a[1].usedAt-b[1].usedAt);
  while(objectUrlCache.size > max && entries.length){
    const [fileId, item] = entries.shift();
    try{ URL.revokeObjectURL(item.url); }catch{}
    objectUrlCache.delete(fileId);
  }
}

function prefetchAround(index){
  const candidates = [filteredSongs[index+1], filteredSongs[index+2]].filter(Boolean);
  for(const song of candidates){
    prefetchFile(song.mp3Id);
    // Também deixa o PDF pronto para rolagem/zoom interno quando o usuário usar esses controles.
    prefetchFile(song.pdfId);
  }
}

function prefetchFile(fileId){
  if(!fileId || objectUrlCache.has(fileId) || prefetchingFiles.has(fileId)) return;
  prefetchingFiles.add(fileId);
  getDriveBlobCached(fileId)
    .catch(()=>{})
    .finally(()=>prefetchingFiles.delete(fileId));
}

function resetAudioSource(){
  els.audio.pause();
  els.audio.removeAttribute('src');
  els.audio.load();
  setPlayButton(false);
}

function resetPdfSource(){
  pdfRenderSeq++;
  currentPdfMode = 'preview';
  els.pdfFrame.removeAttribute('src');
  if(els.pdfScroll){
    els.pdfScroll.classList.remove('active');
    els.pdfScroll.innerHTML = '';
  }
  const viewer = document.getElementById('viewer');
  if(viewer) viewer.classList.remove('scroll-mode');
  if(currentPdfObjectUrl){
    URL.revokeObjectURL(currentPdfObjectUrl);
    currentPdfObjectUrl = '';
  }
}

function setPreviewPdf(url){
  currentPdfMode = 'preview';
  const viewer = document.getElementById('viewer');
  if(viewer) viewer.classList.remove('scroll-mode');
  if(els.pdfScroll){
    els.pdfScroll.classList.remove('active');
    els.pdfScroll.innerHTML = '';
  }
  els.pdfFrame.src = url;
}

function clearCurrent(){
  currentIndex=-1;
  els.songTitle.textContent = library.length ? 'Nenhuma música neste filtro' : 'Nenhuma música carregada';
  els.songMeta.textContent = '';
  resetPdfSource();
  resetAudioSource();
  els.emptyState.style.display = 'grid';
}

function prevSong(){ if(filteredSongs.length) loadSong((currentIndex-1+filteredSongs.length)%filteredSongs.length, false); }
function nextSong(){ if(filteredSongs.length) loadSong((currentIndex+1)%filteredSongs.length, false); }
function togglePlay(){ if(!els.audio.src) return; els.audio.paused ? els.audio.play() : els.audio.pause(); }

function setPlayButton(isPlaying){
  if(!els.playBtn) return;
  els.playBtn.innerHTML = isPlaying
    ? '<span class="control-icon pause-flat"><i></i><i></i></span><span>Pausar</span>'
    : '<span class="control-icon play-flat"></span><span>Tocar</span>';
}
function seekRelative(seconds){
  if(!els.audio || !els.audio.src || !Number.isFinite(els.audio.duration)) return;
  els.audio.currentTime = Math.max(0, Math.min(els.audio.duration, els.audio.currentTime + seconds));
  updateTimeline();
}
function toggleRepeat(){
  if(!els.audio) return;
  els.audio.loop = !els.audio.loop;
  if(els.repeatBtn) els.repeatBtn.classList.toggle('active', els.audio.loop);
  toast(els.audio.loop ? 'Repetição ativada.' : 'Repetição desativada.');
}
function seekFromBar(){
  if(!els.audio || !Number.isFinite(els.audio.duration) || !els.seekBar) return;
  els.audio.currentTime = (Number(els.seekBar.value) / 1000) * els.audio.duration;
  updateTimeline();
}
function updateTimeline(){
  if(!els.audio) return;
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
  if(els.currentTimeLabel) els.currentTimeLabel.textContent = formatTime(current);
  if(els.durationLabel) els.durationLabel.textContent = formatTime(duration);
  if(els.seekBar){
    const value = duration ? Math.round((current / duration) * 1000) : 0;
    els.seekBar.value = String(value);
    els.seekBar.style.setProperty('--progress', `${value / 10}%`);
  }
}
function formatTime(totalSeconds){
  totalSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function toggleStage(){
  document.body.classList.toggle('stage');
  localStorage.setItem(STORAGE.stage, document.body.classList.contains('stage')?'1':'0');
  updateStageBtn();
}
function updateStageBtn(){ els.stageBtn.textContent = document.body.classList.contains('stage') ? 'Sair do palco' : 'Modo palco'; }
function fullscreen(){ const el=document.documentElement; if(!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); }

function clearFolder(){
  localStorage.removeItem(STORAGE.folder);
  localStorage.removeItem(STORAGE.library);
  els.folderIdInput.value='';
  library=[]; filteredSongs=[]; renderStyles(); renderSongs(); clearCurrent();
  toast('Pasta salva removida deste dispositivo.');
}

async function openPicker(){
  if(!(await ensureLogin())) return;
  if(!pickerReady || !window.google?.picker){ toast('Seletor do Drive ainda está carregando.'); return; }
  const apiKey = window.APP_CONFIG?.GOOGLE_API_KEY || '';
  if(!apiKey){ toast('Google Picker precisa de API Key. Você ainda pode colar o ID da pasta manualmente.'); return; }
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder');
  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback(data=>{
      if(data.action === google.picker.Action.PICKED){
        const folder = data.docs[0];
        els.folderIdInput.value = folder.id;
        localStorage.setItem(STORAGE.folder, folder.id);
        refreshLibrary();
      }
    })
    .build();
  picker.setVisible(true);
}

function keyboard(e){
  if(e.target.matches('input,select,textarea')) return;
  if(e.key==='ArrowRight') nextSong();
  if(e.key==='ArrowLeft') prevSong();
  if(e.key===' ') { e.preventDefault(); togglePlay(); }
  if(e.key.toLowerCase()==='m') toggleStage();
  if(e.key.toLowerCase()==='f') toggleFavorite();
  if(e.key.toLowerCase()==='s') toggleAutoScroll();
}


function songKey(song){ return `${song.styleId || song.style}|${song.title}`; }
function getFavorites(){ try{return JSON.parse(localStorage.getItem(STORAGE.favorites)||'[]');}catch{return [];} }
function setFavorites(list){ localStorage.setItem(STORAGE.favorites, JSON.stringify([...new Set(list)])); }
function toggleFavorite(){
  const song = filteredSongs[currentIndex];
  if(!song) return;
  const key = songKey(song);
  let favs = getFavorites();
  if(favs.includes(key)){ favs = favs.filter(x=>x!==key); toast('Removida das favoritas.'); }
  else { favs.push(key); toast('Adicionada às favoritas.'); }
  setFavorites(favs);
  updateFavoriteButton();
  if(els.styleSelect.value === '__favorites') applyFilters();
}
function updateFavoriteButton(){
  const song = filteredSongs[currentIndex];
  if(!song){ els.favoriteBtn.textContent='☆'; return; }
  els.favoriteBtn.textContent = getFavorites().includes(songKey(song)) ? '★' : '☆';
}
function getPlaylists(){ try{return JSON.parse(localStorage.getItem(STORAGE.playlists)||'{}');}catch{return {};} }
function setPlaylists(obj){ localStorage.setItem(STORAGE.playlists, JSON.stringify(obj)); }
function renderPlaylists(){
  const playlists = getPlaylists();
  const names = Object.keys(playlists).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const saved = localStorage.getItem(STORAGE.activePlaylist) || '';
  els.playlistSelect.innerHTML = '<option value="">Todas as playlists</option>' + names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if(saved && names.includes(saved)) els.playlistSelect.value = saved;
}
function createPlaylist(){
  const name = prompt('Nome da playlist/evento:');
  if(!name || !name.trim()) return;
  const playlists = getPlaylists();
  playlists[name.trim()] = playlists[name.trim()] || [];
  setPlaylists(playlists);
  localStorage.setItem(STORAGE.activePlaylist, name.trim());
  renderPlaylists();
  els.playlistSelect.value = name.trim();
  toast('Playlist criada.');
}
function addCurrentToPlaylist(){
  const song = filteredSongs[currentIndex];
  if(!song){ toast('Selecione uma música primeiro.'); return; }
  let name = els.playlistSelect.value;
  if(!name){
    name = prompt('Adicionar a qual playlist? Digite o nome:');
    if(!name || !name.trim()) return;
    name = name.trim();
  }
  const playlists = getPlaylists();
  playlists[name] = playlists[name] || [];
  const key = songKey(song);
  if(!playlists[name].includes(key)) playlists[name].push(key);
  setPlaylists(playlists);
  localStorage.setItem(STORAGE.activePlaylist, name);
  renderPlaylists();
  els.playlistSelect.value = name;
  toast('Música adicionada à playlist.');
}
function deletePlaylist(){
  const name = els.playlistSelect.value;
  if(!name){ toast('Selecione uma playlist para excluir.'); return; }
  if(!confirm(`Excluir a playlist "${name}" deste dispositivo?`)) return;
  const playlists = getPlaylists();
  delete playlists[name];
  setPlaylists(playlists);
  localStorage.removeItem(STORAGE.activePlaylist);
  renderPlaylists();
  applyFilters();
  toast('Playlist excluída.');
}
function toggleAutoScroll(){
  if(autoScrollTimer) { stopAutoScroll(true); return; }
  startAutoScroll();
}
async function startAutoScroll(){
  const song = filteredSongs[currentIndex];
  if(!song) { toast('Carregue uma música primeiro.'); return; }
  stopAutoScroll(false);
  try{
    await ensureScrollablePdf(song);
  }catch(err){
    console.error(err);
    toast('Não consegui preparar a rolagem automática deste PDF.');
    return;
  }
  els.autoScrollBtn.textContent = '⏸ Rolagem';
  autoScrollTimer = setInterval(()=>{
    const target = els.pdfScroll;
    if(!target) return;
    target.scrollTop += autoScrollSpeed;
    if(target.scrollTop + target.clientHeight >= target.scrollHeight - 2){
      stopAutoScroll(false);
      toast('Fim da cifra.');
    }
  }, 80);
}
function stopAutoScroll(showToast=true){
  if(autoScrollTimer){ clearInterval(autoScrollTimer); autoScrollTimer=null; }
  if(els.autoScrollBtn) els.autoScrollBtn.textContent = '▶ Rolagem';
  if(showToast) toast('Rolagem pausada.');
}

async function ensureScrollablePdf(song, forceRender=false){
  if(!window.pdfjsLib) throw new Error('PDF.js não carregou.');
  if(!forceRender && currentPdfMode === 'scroll' && els.pdfScroll?.dataset.fileId === song.pdfId && Number(els.pdfScroll?.dataset.zoom||1) === pdfZoom) return;
  currentPdfMode = 'scroll';
  const seq = ++pdfRenderSeq;
  const viewer = document.getElementById('viewer');
  if(viewer) viewer.classList.add('scroll-mode');
  els.pdfScroll.classList.add('active');
  els.pdfScroll.dataset.fileId = song.pdfId;
  els.pdfScroll.dataset.zoom = String(pdfZoom);
  els.pdfScroll.innerHTML = '<div class="pdf-loading">Preparando rolagem automática...</div>';

  const blob = await getDriveBlobCached(song.pdfId);
  const data = await blob.arrayBuffer();
  if(seq !== pdfRenderSeq) return;

  const pdf = await pdfjsLib.getDocument({data}).promise;
  if(seq !== pdfRenderSeq) return;
  els.pdfScroll.innerHTML = '';
  els.pdfScroll.scrollTop = 0;

  for(let pageNum=1; pageNum<=pdf.numPages; pageNum++){
    if(seq !== pdfRenderSeq) return;
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({scale:1});
    const availableWidth = Math.max(320, els.pdfScroll.clientWidth - 24);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssScale = (availableWidth / baseViewport.width) * pdfZoom;
    const renderViewport = page.getViewport({scale: cssScale * dpr});
    const cssViewport = page.getViewport({scale: cssScale});

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(cssViewport.width)}px`;
    canvas.style.height = `${Math.floor(cssViewport.height)}px`;
    els.pdfScroll.appendChild(canvas);
    const ctx = canvas.getContext('2d', {alpha:false});
    await page.render({canvasContext:ctx, viewport:renderViewport}).promise;
  }
}

async function changePdfZoom(delta){
  const song = filteredSongs[currentIndex];
  if(!song){ toast('Carregue uma música primeiro.'); return; }
  pdfZoom = Math.max(0.6, Math.min(2.4, Number((pdfZoom + delta).toFixed(2))));
  localStorage.setItem(STORAGE.pdfZoom, String(pdfZoom));
  updateZoomLabel();
  try{
    await ensureScrollablePdf(song, true);
    toast(`Zoom do PDF: ${Math.round(pdfZoom*100)}%`);
  }catch(err){
    console.error(err);
    toast('Não consegui aplicar zoom neste PDF.');
  }
}
function updateZoomLabel(){
  pdfZoom = Number(localStorage.getItem(STORAGE.pdfZoom) || pdfZoom || 1);
  if(els.zoomLabel) els.zoomLabel.textContent = `${Math.round(pdfZoom*100)}%`;
}

function changeScrollSpeed(delta){
  autoScrollSpeed = Math.max(1, Math.min(12, autoScrollSpeed + delta));
  localStorage.setItem('pc_scroll_speed', String(autoScrollSpeed));
  updateSpeedLabel();
}
function updateSpeedLabel(){
  autoScrollSpeed = Number(localStorage.getItem('pc_scroll_speed') || autoScrollSpeed || 1);
  if(els.speedLabel) els.speedLabel.textContent = `${autoScrollSpeed}x`;
}

function extractFolderId(value){
  if(!value) return '';
  const match = value.match(/folders\/([a-zA-Z0-9_-]+)/) || value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value.trim();
}
function getExt(name){ return (name.split('.').pop()||'').toLowerCase(); }
function normalizeBase(name){ return name.replace(/\.[^.]+$/,'').trim(); }
function normalizeMatchKey(name){ return removeAccents(normalizeBase(name).toLowerCase()).replace(/\s+/g,' ').trim(); }
function removeAccents(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>els.toast.classList.remove('show'),3600);
}
