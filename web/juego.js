// Motor del juego «Tres palabras». Sin dependencias: se usa en el navegador y en las pruebas (node --test).
// Todo el estado es un objeto JSON serializable, para poder guardarlo en el móvil y recuperarlo si se recarga.

export const RONDAS = [
  { nombre: 'Explicar', regla: 'Explica la palabra con todas las palabras que quieras, sin decirla ni usar su raíz.' },
  { nombre: 'Una palabra', regla: 'Di una sola palabra relacionada. Nada más.' },
  { nombre: 'Mímica', regla: 'Solo gestos. Sin hablar ni hacer sonidos.' },
];

export const GRUPOS = ['A', 'B'];

export function barajar(lista, rng = Math.random) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// jugadores: [{ id, nombre, grupo: 'A'|'B', palabras: [3 textos] }]
export function nuevaPartida({ jugadores, duracion = 60, rng = Math.random }) {
  const errores = validarJugadores(jugadores);
  if (errores.length) throw new Error(errores.join(' '));
  const palabras = [];
  for (const j of jugadores) {
    for (const texto of j.palabras) palabras.push({ id: palabras.length, texto: texto.trim(), autor: j.id });
  }
  const orden = {};
  for (const g of GRUPOS) orden[g] = barajar(jugadores.filter(j => j.grupo === g).map(j => j.id), rng);
  return {
    version: 1,
    duracion,
    jugadores: jugadores.map(({ id, nombre, grupo }) => ({ id, nombre, grupo })),
    palabras,
    orden,                       // en qué orden presenta cada jugador de cada grupo
    siguienteJugador: { A: 0, B: 0 },
    ronda: 0,
    mazo: barajar(palabras.map(p => p.id), rng),
    grupoTurno: rng() < 0.5 ? 'A' : 'B',
    puntos: { A: [0, 0, 0], B: [0, 0, 0] },
    fase: 'pasar',               // pasar → jugando → finTurno → (pasar | finRonda → pasar | fin)
    turno: null,
    historial: [],               // un registro por turno terminado
  };
}

export function validarJugadores(jugadores) {
  const errores = [];
  for (const g of GRUPOS) {
    const n = jugadores.filter(j => j.grupo === g).length;
    if (n < 2) errores.push(`El grupo ${g} necesita al menos 2 jugadores (tiene ${n}).`);
  }
  for (const j of jugadores) {
    if (!Array.isArray(j.palabras) || j.palabras.length !== 3 || j.palabras.some(p => !String(p).trim())) {
      errores.push(`${j.nombre || 'Un jugador'} no tiene sus tres palabras.`);
    }
  }
  return errores;
}

export function presentador(s) {
  const lista = s.orden[s.grupoTurno];
  return s.jugadores.find(j => j.id === lista[s.siguienteJugador[s.grupoTurno] % lista.length]);
}

export function textoPalabra(s, id) {
  return s.palabras.find(p => p.id === id)?.texto ?? '';
}

export function empezarTurno(s, ahora) {
  if (s.fase !== 'pasar') return s;
  const p = presentador(s);
  s.turno = {
    grupo: s.grupoTurno,
    jugador: p.id,
    ronda: s.ronda,
    aciertos: [],
    actual: s.mazo.shift(),
    finEn: ahora + s.duracion * 1000,
  };
  s.fase = 'jugando';
  return s;
}

export function restante(s, ahora) {
  if (s.fase !== 'jugando') return 0;
  return Math.max(0, s.turno.finEn - ahora);
}

export function acertar(s, ahora) {
  if (s.fase !== 'jugando') return s;
  if (restante(s, ahora) <= 0) return tiempoAgotado(s);
  const t = s.turno;
  t.aciertos.push(t.actual);
  s.puntos[t.grupo][t.ronda]++;
  if (s.mazo.length) t.actual = s.mazo.shift();
  else { t.actual = null; cerrarTurno(s, true); }
  return s;
}

// Corrige un toque por error: la última acertada vuelve a ser la palabra en juego.
export function deshacer(s) {
  if (s.fase !== 'jugando' || !s.turno.aciertos.length) return s;
  const t = s.turno;
  if (t.actual !== null) s.mazo.unshift(t.actual);
  t.actual = t.aciertos.pop();
  s.puntos[t.grupo][t.ronda]--;
  return s;
}

// Se acabó el tiempo: la palabra que estaba en juego vuelve al montón, que se baraja de nuevo.
export function tiempoAgotado(s, rng = Math.random) {
  if (s.fase !== 'jugando') return s;
  const t = s.turno;
  if (t.actual !== null) { s.mazo.push(t.actual); s.mazo = barajar(s.mazo, rng); t.actual = null; }
  cerrarTurno(s, false);
  return s;
}

function cerrarTurno(s, mazoVacio) {
  const t = s.turno;
  s.historial.push({ ronda: t.ronda, grupo: t.grupo, jugador: t.jugador, aciertos: t.aciertos.slice() });
  s.siguienteJugador[t.grupo]++;
  s.grupoTurno = t.grupo === 'A' ? 'B' : 'A';
  s.rondaTerminada = mazoVacio;
  s.fase = 'finTurno';
}

// Tras la pantalla de fin de turno: pasa al siguiente turno, a la siguiente ronda o al final.
export function continuar(s, rng = Math.random) {
  if (s.fase === 'finTurno') {
    if (!s.rondaTerminada) { s.fase = 'pasar'; s.turno = null; return s; }
    if (s.ronda < RONDAS.length - 1) { s.fase = 'finRonda'; return s; }
    s.fase = 'fin'; s.turno = null; return s;
  }
  if (s.fase === 'finRonda') {
    s.ronda++;
    s.mazo = barajar(s.palabras.map(p => p.id), rng);
    s.rondaTerminada = false;
    s.fase = 'pasar'; s.turno = null;
  }
  return s;
}

export function totales(s) {
  const tot = {};
  for (const g of GRUPOS) tot[g] = s.puntos[g].reduce((a, b) => a + b, 0);
  return tot;
}

export function ganador(s) {
  const t = totales(s);
  if (t.A === t.B) return null;
  return t.A > t.B ? 'A' : 'B';
}
