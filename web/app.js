import * as J from './juego.js';

const app = document.getElementById('app');
const API = '/api/sesiones';
const CLAVE_PARTIDA = 'tp-partida';

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardar = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const $ = sel => app.querySelector(sel);

async function api(ruta, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + ruta, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Algo ha fallado. Inténtalo de nuevo.');
  return datos;
}

let sondeo = null;
function pararSondeo() { clearInterval(sondeo); sondeo = null; }
function sondear(fn, ms = 2000) { pararSondeo(); fn(); sondeo = setInterval(fn, ms); }

let reloj = null;
function pararReloj() { clearInterval(reloj); reloj = null; }

function pintar(html) { pararReloj(); app.innerHTML = html; window.scrollTo(0, 0); }

document.getElementById('btn-ayuda').onclick = () => document.getElementById('dlg-ayuda').showModal();

// ---------- inicio ----------
function inicio(error = '') {
  pararSondeo();
  const partida = leer(CLAVE_PARTIDA);
  pintar(`
    <div class="logo">🎲</div>
    <h1>Tres palabras</h1>
    <p class="suave">Cada uno aporta tres palabras. En tres rondas hay que adivinarlas: explicándolas, con una sola palabra y con mímica.</p>
    ${partida && partida.fase !== 'fin' ? `<p><button class="btn ancho" id="seguir">Seguir la partida en curso</button></p>` : ''}
    <button class="redondo" id="crear">Crear<br>partida</button>
    <p><b>¿Te han pasado un código?</b></p>
    <div class="fila">
      <input type="text" id="codigo" class="codigo-input" maxlength="5" placeholder="CÓDIGO" autocomplete="off" aria-label="Código de la partida">
      <button class="btn" id="unirme" style="flex:0 0 auto">Unirme</button>
    </div>
    <p class="error">${esc(error)}</p>
    <p class="suave pequeno">Gratis, sin registro. Las palabras se borran a las 24 horas.</p>
  `);
  $('#seguir')?.addEventListener('click', jugar);
  $('#crear').onclick = crear;
  const ir = () => {
    const c = $('#codigo').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(c)) return inicio('El código tiene 5 letras o números.');
    location.search = '?s=' + c;
  };
  $('#unirme').onclick = ir;
  $('#codigo').onkeydown = e => { if (e.key === 'Enter') ir(); };
}

async function crear() {
  $('#crear').disabled = true;
  try {
    const s = await api('', { method: 'POST', body: { duracion: 60 } });
    guardar('tp-anfitrion-' + s.codigo, s.tokenAnfitrion);
    history.pushState(null, '', '?s=' + s.codigo);
    sala(s.codigo);
  } catch (e) { inicio(e.message); }
}

// ---------- formulario de jugador (se usa para unirse y para añadir a alguien desde el móvil del anfitrión) ----------
function formJugador({ titulo, boton, valores = {}, alEnviar, alCancelar }) {
  const v = { nombre: '', grupo: '', palabras: ['', '', ''], ...valores };
  pintar(`
    <h2>${esc(titulo)}</h2>
    <form id="f" class="campos" autocomplete="off">
      <label for="nombre">Nombre</label>
      <input type="text" id="nombre" maxlength="30" value="${esc(v.nombre)}" required>
      <label>Grupo</label>
      <div class="grupos">
        <button type="button" class="grupo-btn A" data-g="A" aria-pressed="${v.grupo === 'A'}">Grupo A</button>
        <button type="button" class="grupo-btn B" data-g="B" aria-pressed="${v.grupo === 'B'}">Grupo B</button>
      </div>
      <label>Tus tres palabras <span class="suave pequeno">(nadie más las ve)</span></label>
      ${[0, 1, 2].map(i => `<input type="text" class="pal" maxlength="40" placeholder="Palabra ${i + 1}" value="${esc(v.palabras[i])}">`).join('')}
      <p class="error" id="err"></p>
      <button class="btn ancho" type="submit">${esc(boton)}</button>
    </form>
    ${alCancelar ? '<button class="enlace" id="cancelar">Cancelar</button>' : ''}
  `);
  let grupo = v.grupo;
  app.querySelectorAll('.grupo-btn').forEach(b => b.onclick = () => {
    grupo = b.dataset.g;
    app.querySelectorAll('.grupo-btn').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  $('#cancelar')?.addEventListener('click', alCancelar);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const datos = { nombre: $('#nombre').value, grupo, palabras: [...app.querySelectorAll('.pal')].map(i => i.value) };
    if (!grupo) return ($('#err').textContent = 'Elige el grupo A o el B.');
    $('#f button[type=submit]').disabled = true;
    try { await alEnviar(datos); }
    catch (err) { $('#err').textContent = err.message; $('#f button[type=submit]').disabled = false; }
  };
}

// ---------- jugador que se une desde su móvil ----------
async function unirse(codigo) {
  const clave = 'tp-jugador-' + codigo;
  const yo = leer(clave);
  let s;
  try { s = await api('/' + codigo, { token: yo?.token }); }
  catch (e) { history.replaceState(null, '', location.pathname); return inicio(e.message); }

  if (s.yo) return espera(codigo);
  if (s.estado !== 'abierta') return mensaje('La partida ya ha empezado', 'Ya no se pueden añadir palabras a esta sesión.');
  formJugador({
    titulo: 'Únete a la partida ' + codigo,
    boton: 'Enviar mis palabras',
    alEnviar: async datos => {
      const r = await api('/' + codigo + '/jugadores', { method: 'POST', body: datos });
      guardar(clave, { id: r.id, token: r.token });
      espera(codigo);
    },
  });
}

function espera(codigo) {
  const yo = leer('tp-jugador-' + codigo);
  sondear(async () => {
    let s;
    try { s = await api('/' + codigo, { token: yo.token }); } catch (e) { return; }
    if (!s.yo) { guardar('tp-jugador-' + codigo, null); pararSondeo(); return unirse(codigo); }
    if (s.estado !== 'abierta') {
      pararSondeo();
      return mensaje('¡Empieza la partida!', 'Ya podéis jugar con el móvil del anfitrión. Guarda el tuyo y atento a tu turno.');
    }
    pintar(`
      <div class="logo">✅</div>
      <h2>¡Listo, ${esc(s.yo.nombre)}!</h2>
      <p>Estás en el <span class="chip ${s.yo.grupo}">grupo ${s.yo.grupo}</span>. Tus palabras: <b>${s.yo.palabras.map(esc).join(' · ')}</b></p>
      <p class="suave">Espera a que el anfitrión empiece la partida. Se juega con su móvil.</p>
      ${listaGrupos(s)}
      <button class="btn sec" id="editar">Cambiar mis datos</button>
    `);
    $('#editar').onclick = () => {
      pararSondeo();
      formJugador({
        titulo: 'Cambia tus datos', boton: 'Guardar', valores: s.yo,
        alEnviar: async d => { await api('/' + codigo + '/jugadores/' + yo.id, { method: 'PATCH', token: yo.token, body: d }); espera(codigo); },
        alCancelar: () => espera(codigo),
      });
    };
  }, 2500);
}

function mensaje(titulo, texto) {
  pararSondeo();
  pintar(`<div class="logo">🎲</div><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
    <button class="btn sec" id="volver">Volver al inicio</button>`);
  $('#volver').onclick = () => { history.replaceState(null, '', location.pathname); inicio(); };
}

function listaGrupos(s, { anfitrion = false } = {}) {
  const col = g => {
    const js = s.jugadores.filter(j => j.grupo === g);
    return `<div class="col ${g}"><h3>Grupo ${g} · ${js.length}</h3><ul>
      ${js.map(j => `<li><span>${esc(j.nombre)}</span>${anfitrion ? `
        <button class="mini" data-mover="${j.id}" data-g="${g === 'A' ? 'B' : 'A'}" aria-label="Pasar a ${esc(j.nombre)} al grupo ${g === 'A' ? 'B' : 'A'}">⇄</button>
        <button class="mini" data-quitar="${j.id}" aria-label="Quitar a ${esc(j.nombre)}">✕</button>` : ''}</li>`).join('') || '<li class="suave">Nadie todavía</li>'}
    </ul></div>`;
  };
  return `<div class="cols">${col('A')}${col('B')}</div>`;
}

// ---------- sala del anfitrión ----------
function sala(codigo) {
  const token = leer('tp-anfitrion-' + codigo);
  const enlace = location.origin + location.pathname + '?s=' + codigo;
  let ultimo = '';
  sondear(async () => {
    let s;
    try { s = await api('/' + codigo, { token }); } catch (e) { pararSondeo(); return inicio(e.message); }
    const firma = JSON.stringify(s);
    if (firma === ultimo) return;
    ultimo = firma;
    const faltan = J.GRUPOS.filter(g => s.jugadores.filter(j => j.grupo === g).length < 2);
    pintar(`
      <h2>Tu partida</h2>
      <p class="suave">Que cada uno entre en esta web con el código, o compárteles el enlace:</p>
      <div class="codigo">${esc(codigo)}</div>
      <div class="fila">
        <button class="btn sec" id="compartir">Compartir enlace</button>
        <button class="btn sec" id="copiar">Copiar</button>
      </div>
      ${listaGrupos(s, { anfitrion: true })}
      <button class="btn sec ancho" id="anadir">+ Añadir jugador en este móvil</button>
      <div class="ajuste">
        <span>Tiempo por turno</span>
        <button class="btn sec" id="menos" aria-label="Menos tiempo">−</button>
        <b>${s.duracion} s</b>
        <button class="btn sec" id="mas" aria-label="Más tiempo">+</button>
      </div>
      <p class="suave pequeno">${faltan.length ? `Hacen falta al menos 2 jugadores en ${faltan.map(g => 'el grupo ' + g).join(' y ')}.` : `${s.jugadores.length} jugadores · ${s.jugadores.length * 3} palabras`}</p>
      <button class="redondo" id="empezar" ${faltan.length ? 'disabled' : ''}>Empezar</button>
      <p class="error" id="err"></p>
    `);
    $('#compartir').onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title: 'Tres palabras', text: 'Únete a la partida ' + codigo, url: enlace }); } catch {} }
      else copiar();
    };
    const copiar = async () => { try { await navigator.clipboard.writeText(enlace); $('#copiar').textContent = '¡Copiado!'; } catch { prompt('Copia el enlace:', enlace); } };
    $('#copiar').onclick = copiar;
    app.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => accion(() =>
      api(`/${codigo}/jugadores/${b.dataset.mover}`, { method: 'PATCH', token, body: { grupo: b.dataset.g } })));
    app.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => {
      if (confirm('¿Quitar a este jugador y sus palabras?')) accion(() => api(`/${codigo}/jugadores/${b.dataset.quitar}`, { method: 'DELETE', token }));
    });
    const cambiarTiempo = d => accion(() => api(`/${codigo}/ajustes`, { method: 'PATCH', token, body: { duracion: Math.min(300, Math.max(15, s.duracion + d)) } }));
    $('#menos').onclick = () => cambiarTiempo(-15);
    $('#mas').onclick = () => cambiarTiempo(15);
    $('#anadir').onclick = () => {
      pararSondeo();
      formJugador({
        titulo: 'Añadir jugador', boton: 'Añadir',
        alEnviar: async d => { await api('/' + codigo + '/jugadores', { method: 'POST', body: d }); sala(codigo); },
        alCancelar: () => sala(codigo),
      });
    };
    $('#empezar').onclick = () => empezar(codigo, token);
  });

  async function accion(fn) {
    try { await fn(); ultimo = ''; } catch (e) { const err = $('#err'); if (err) err.textContent = e.message; }
  }
}

async function empezar(codigo, token) {
  $('#empezar').disabled = true;
  try {
    const s = await api('/' + codigo + '/iniciar', { method: 'POST', token });
    pararSondeo();
    const partida = J.nuevaPartida({ jugadores: s.jugadores, duracion: s.duracion });
    partida.codigo = codigo;
    guardar(CLAVE_PARTIDA, partida);
    jugar();
  } catch (e) { $('#err').textContent = e.message; $('#empezar').disabled = false; }
}

// ---------- el juego, en el móvil del anfitrión ----------
let bloqueo = null;
async function mantenerPantalla(si) {
  try {
    if (si && !bloqueo && 'wakeLock' in navigator) bloqueo = await navigator.wakeLock.request('screen');
    if (!si && bloqueo) { await bloqueo.release(); bloqueo = null; }
  } catch {}
}

let audio = null;
function pitido(frec = 880, ms = 150) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = frec; g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch {}
}

function marcador(p) {
  const t = J.totales(p);
  return `<div class="marcador"><span class="chip A">A</span><b>${t.A}</b><span>–</span><b>${t.B}</b><span class="chip B">B</span></div>`;
}

function jugar() {
  pararSondeo();
  const p = leer(CLAVE_PARTIDA);
  if (!p) return inicio();
  const ok = () => guardar(CLAVE_PARTIDA, p);
  const ronda = J.RONDAS[p.ronda];

  if (p.fase === 'jugando' && J.restante(p, Date.now()) <= 0) { J.tiempoAgotado(p); ok(); }

  if (p.fase === 'pasar') {
    mantenerPantalla(false);
    const quien = J.presentador(p);
    pintar(`
      <p class="suave">Ronda ${p.ronda + 1} de 3</p>
      <h2>${esc(ronda.nombre)}</h2>
      <div class="regla">${esc(ronda.regla)}</div>
      ${marcador(p)}
      <p>Turno del <span class="chip ${p.grupoTurno}">grupo ${p.grupoTurno}</span></p>
      <p>Pasa el móvil a</p>
      <h1>${esc(quien.nombre)}</h1>
      <p class="suave pequeno">Quedan ${p.mazo.length} palabras en esta ronda · ${p.duracion} s</p>
      <button class="redondo" id="ya">¡Ya!</button>
      <button class="enlace" id="menu">Terminar partida</button>
    `);
    $('#ya').onclick = () => { pitido(660); J.empezarTurno(p, Date.now()); ok(); jugar(); };
    $('#menu').onclick = salir;
    return;
  }

  if (p.fase === 'jugando') {
    mantenerPantalla(true);
    const total = p.duracion * 1000;
    const circ = 2 * Math.PI * 42;
    pintar(`
      <p class="suave">${esc(ronda.nombre)} · <span class="chip ${p.turno.grupo}">grupo ${p.turno.grupo}</span></p>
      <div class="reloj" id="reloj">
        <svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill="none" stroke="#E3E0EC" stroke-width="8"/>
        <circle id="arco" cx="48" cy="48" r="42" fill="none" stroke="#F0457F" stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ}"/></svg>
        <span id="seg"></span>
      </div>
      <div class="palabra" id="palabra">${esc(J.textoPalabra(p, p.turno.actual))}</div>
      <p class="suave pequeno">Acertadas: <b id="n">${p.turno.aciertos.length}</b> · Quedan ${p.mazo.length + 1}</p>
      <button class="redondo ok" id="acierto">¡Acertada!</button>
      <button class="enlace" id="deshacer" ${p.turno.aciertos.length ? '' : 'disabled'}>Deshacer la última</button>
    `);
    let ultimoSeg = null;
    const tic = () => {
      const r = J.restante(p, Date.now());
      const seg = Math.ceil(r / 1000);
      $('#seg').textContent = seg;
      $('#arco').setAttribute('stroke-dashoffset', circ * (1 - r / total));
      $('#reloj').classList.toggle('poco', seg <= 10);
      if (seg !== ultimoSeg && seg <= 5 && seg > 0) pitido(880, 80);
      ultimoSeg = seg;
      if (r <= 0) { J.tiempoAgotado(p); ok(); pitido(330, 600); navigator.vibrate?.(400); jugar(); }
    };
    tic();
    reloj = setInterval(tic, 200);
    $('#acierto').onclick = () => { J.acertar(p, Date.now()); ok(); navigator.vibrate?.(30); jugar(); };
    $('#deshacer').onclick = () => { J.deshacer(p); ok(); jugar(); };
    return;
  }

  if (p.fase === 'finTurno') {
    mantenerPantalla(false);
    const t = p.historial[p.historial.length - 1];
    const quien = p.jugadores.find(j => j.id === t.jugador);
    pintar(`
      <div class="logo">${p.rondaTerminada ? '🎉' : '⏰'}</div>
      <h2>${p.rondaTerminada ? '¡No quedan palabras!' : '¡Tiempo!'}</h2>
      <p>${esc(quien.nombre)} (<span class="chip ${t.grupo}">grupo ${t.grupo}</span>) ha conseguido <b>${t.aciertos.length}</b> ${t.aciertos.length === 1 ? 'palabra' : 'palabras'}:</p>
      <ul class="lista-aciertos">${t.aciertos.map(id => `<li>${esc(J.textoPalabra(p, id))}</li>`).join('') || '<li class="suave">Ninguna</li>'}</ul>
      ${marcador(p)}
      <button class="btn ancho" id="seguir">Continuar</button>
    `);
    $('#seguir').onclick = () => { J.continuar(p); ok(); jugar(); };
    return;
  }

  if (p.fase === 'finRonda') {
    const sig = J.RONDAS[p.ronda + 1];
    pintar(`
      <div class="logo">🏁</div>
      <h2>Fin de la ronda ${p.ronda + 1}</h2>
      ${tablaPuntos(p)}
      <p>Siguiente ronda: <b>${esc(sig.nombre)}</b></p>
      <div class="regla">${esc(sig.regla)}</div>
      <p class="suave pequeno">Se vuelven a usar todas las palabras. Empieza el <span class="chip ${p.grupoTurno}">grupo ${p.grupoTurno}</span>.</p>
      <button class="redondo" id="seguir">Ronda ${p.ronda + 2}</button>
    `);
    $('#seguir').onclick = () => { J.continuar(p); ok(); jugar(); };
    return;
  }

  // fin
  mantenerPantalla(false);
  const g = J.ganador(p);
  pintar(`
    <div class="logo">🏆</div>
    <h1>${g ? `¡Gana el grupo ${g}!` : '¡Empate!'}</h1>
    ${marcador(p)}
    ${tablaPuntos(p)}
    <button class="btn ancho" id="otra">Otra partida con las mismas palabras</button>
    <p><button class="enlace" id="nueva">Nueva partida</button></p>
  `);
  $('#otra').onclick = () => {
    const nueva = J.nuevaPartida({
      jugadores: p.jugadores.map(j => ({ ...j, palabras: p.palabras.filter(w => w.autor === j.id).map(w => w.texto) })),
      duracion: p.duracion,
    });
    nueva.codigo = p.codigo;
    guardar(CLAVE_PARTIDA, nueva);
    jugar();
  };
  $('#nueva').onclick = () => { guardar(CLAVE_PARTIDA, null); history.replaceState(null, '', location.pathname); inicio(); };
}

function tablaPuntos(p) {
  return `<table><thead><tr><th>Ronda</th><th><span class="chip A">A</span></th><th><span class="chip B">B</span></th></tr></thead><tbody>
    ${J.RONDAS.map((r, i) => `<tr><td>${i + 1} · ${esc(r.nombre)}</td><td>${p.puntos.A[i]}</td><td>${p.puntos.B[i]}</td></tr>`).join('')}
    </tbody></table>`;
}

function salir() {
  if (!confirm('¿Terminar la partida? Se perderá el marcador.')) return;
  guardar(CLAVE_PARTIDA, null);
  history.replaceState(null, '', location.pathname);
  inicio();
}

// ---------- arranque ----------
function arrancar() {
  const codigo = (new URLSearchParams(location.search).get('s') || '').toUpperCase();
  const partida = leer(CLAVE_PARTIDA);
  if (codigo && leer('tp-anfitrion-' + codigo)) {
    if (partida && partida.codigo === codigo) return jugar();
    return sala(codigo);
  }
  if (codigo) return unirse(codigo);
  inicio();
}
window.addEventListener('popstate', arrancar);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && leer(CLAVE_PARTIDA)?.fase === 'jugando') mantenerPantalla(true);
});
arrancar();
