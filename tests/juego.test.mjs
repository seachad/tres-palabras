import test from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../web/juego.js';

const jugadores = [
  { id: 'a1', nombre: 'Ana', grupo: 'A', palabras: ['sol', 'luna', 'mar'] },
  { id: 'a2', nombre: 'Alba', grupo: 'A', palabras: ['tren', 'coche', 'avión'] },
  { id: 'b1', nombre: 'Bea', grupo: 'B', palabras: ['pera', 'uva', 'kiwi'] },
  { id: 'b2', nombre: 'Blas', grupo: 'B', palabras: ['rojo', 'azul', 'verde'] },
];
const semilla = (n = 1) => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };

test('exige al menos dos jugadores por grupo y tres palabras', () => {
  assert.throws(() => J.nuevaPartida({ jugadores: jugadores.slice(0, 3) }), /grupo B/);
  assert.throws(() => J.nuevaPartida({ jugadores: [...jugadores.slice(0, 3), { ...jugadores[3], palabras: ['x', ''] }] }), /tres palabras/);
});

test('una partida completa: tres rondas, cada palabra se acierta una vez por ronda', () => {
  const rng = semilla(7);
  const p = J.nuevaPartida({ jugadores, duracion: 60, rng });
  assert.equal(p.palabras.length, 12);
  let t = 0, turnos = 0;
  while (p.fase !== 'fin') {
    if (p.fase === 'pasar') {
      J.empezarTurno(p, t); turnos++;
      // acierta tres palabras y deja que se acabe el tiempo
      for (let i = 0; i < 3 && p.fase === 'jugando'; i++) J.acertar(p, t + 1000);
      if (p.fase === 'jugando') J.tiempoAgotado(p, rng);
    } else J.continuar(p, rng);
    t += 61000;
    assert.ok(turnos < 100);
  }
  for (let r = 0; r < 3; r++) {
    const aciertos = p.historial.filter(h => h.ronda === r).flatMap(h => h.aciertos);
    assert.equal(aciertos.length, 12, 'cada ronda acierta las 12 palabras');
    assert.equal(new Set(aciertos).size, 12, 'ninguna palabra se repite en una ronda');
    assert.equal(p.puntos.A[r] + p.puntos.B[r], 12);
  }
  const tot = J.totales(p);
  assert.equal(tot.A + tot.B, 36);
});

test('los grupos alternan y los presentadores rotan dentro de cada grupo', () => {
  const p = J.nuevaPartida({ jugadores, rng: semilla(3) });
  const vistos = [];
  for (let i = 0; i < 4; i++) {
    vistos.push([p.grupoTurno, J.presentador(p).id]);
    J.empezarTurno(p, 0); J.tiempoAgotado(p); J.continuar(p);
  }
  assert.notEqual(vistos[0][0], vistos[1][0]);
  assert.equal(vistos[0][0], vistos[2][0]);
  assert.notEqual(vistos[0][1], vistos[2][1], 'el mismo grupo cambia de presentador');
});

test('al acabar el tiempo la palabra en juego vuelve al montón', () => {
  const p = J.nuevaPartida({ jugadores, rng: semilla(5) });
  J.empezarTurno(p, 0);
  const enJuego = p.turno.actual;
  J.tiempoAgotado(p);
  assert.ok(p.mazo.includes(enJuego));
  assert.equal(p.mazo.length, 12);
});

test('acertar con el tiempo agotado no suma y cierra el turno', () => {
  const p = J.nuevaPartida({ jugadores, duracion: 60, rng: semilla(9) });
  J.empezarTurno(p, 0);
  J.acertar(p, 61000);
  assert.equal(p.fase, 'finTurno');
  assert.equal(J.totales(p).A + J.totales(p).B, 0);
});

test('deshacer devuelve la última acertada y resta el punto', () => {
  const p = J.nuevaPartida({ jugadores, rng: semilla(11) });
  J.empezarTurno(p, 0);
  const primera = p.turno.actual;
  J.acertar(p, 100);
  const segunda = p.turno.actual;
  J.deshacer(p);
  assert.equal(p.turno.actual, primera);
  assert.equal(p.mazo[0], segunda);
  assert.equal(J.totales(p).A + J.totales(p).B, 0);
});
