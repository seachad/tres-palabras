import test from 'node:test';
import assert from 'node:assert/strict';
import { validarJugador, vistaPublica, nuevoCodigo, codigoValido, duracionValida } from '../worker/logica.js';

test('valida nombre, grupo y tres palabras distintas', () => {
  assert.ok(validarJugador({ nombre: ' Ana ', grupo: 'A', palabras: ['sol', 'luna', 'mar'] }).datos);
  assert.match(validarJugador({ nombre: '', grupo: 'A', palabras: ['a', 'b', 'c'] }).error, /nombre/);
  assert.match(validarJugador({ nombre: 'Ana', grupo: 'C', palabras: ['a', 'b', 'c'] }).error, /grupo/);
  assert.match(validarJugador({ nombre: 'Ana', grupo: 'A', palabras: ['a', 'b'] }).error, /tres/);
  assert.match(validarJugador({ nombre: 'Ana', grupo: 'A', palabras: ['Sol', 'sol', 'c'] }).error, /distintas/);
  assert.deepEqual(validarJugador({ grupo: 'B' }, { parcial: true }).datos, { grupo: 'B' });
});

test('la vista pública no enseña palabras ni tokens', () => {
  const v = vistaPublica({ codigo: 'ABCDE', estado: 'abierta', duracion: 60, anfitrion: 'x',
    jugadores: [{ id: '1', token: 't', nombre: 'Ana', grupo: 'A', palabras: ['sol', 'luna', 'mar'] }] });
  const texto = JSON.stringify(v);
  assert.ok(!texto.includes('sol') && !texto.includes('"t"') && !texto.includes('anfitrion'));
});

test('códigos y duraciones', () => {
  for (let i = 0; i < 50; i++) assert.ok(codigoValido(nuevoCodigo()));
  assert.equal(duracionValida(60), 60);
  assert.equal(duracionValida(5), null);
  assert.equal(duracionValida('90'), 90);
});
