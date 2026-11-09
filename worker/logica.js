// Validación y forma de los datos de una sesión. Sin dependencias de Cloudflare, para poder probarlo con node.

export const MAX_JUGADORES = 40;
export const MAX_NOMBRE = 30;
export const MAX_PALABRA = 40;
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin I, L, O, 0 ni 1, que se confunden

export function nuevoCodigo(rng = Math.random) {
  let c = '';
  for (let i = 0; i < 5; i++) c += LETRAS[Math.floor(rng() * LETRAS.length)];
  return c;
}

export function codigoValido(c) {
  return typeof c === 'string' && /^[A-Z0-9]{5}$/.test(c);
}

const limpiar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function duracionValida(d) {
  const n = Number(d);
  return Number.isInteger(n) && n >= 15 && n <= 300 ? n : null;
}

// Devuelve { datos } o { error } a partir de lo que manda un jugador al unirse o editar.
export function validarJugador(entrada, { parcial = false } = {}) {
  const datos = {};
  if (!parcial || entrada.nombre !== undefined) {
    const nombre = limpiar(entrada.nombre, MAX_NOMBRE);
    if (!nombre) return { error: 'Escribe tu nombre.' };
    datos.nombre = nombre;
  }
  if (!parcial || entrada.grupo !== undefined) {
    if (entrada.grupo !== 'A' && entrada.grupo !== 'B') return { error: 'Elige el grupo A o el B.' };
    datos.grupo = entrada.grupo;
  }
  if (!parcial || entrada.palabras !== undefined) {
    if (!Array.isArray(entrada.palabras) || entrada.palabras.length !== 3) return { error: 'Hacen falta exactamente tres palabras.' };
    const palabras = entrada.palabras.map(p => limpiar(p, MAX_PALABRA));
    if (palabras.some(p => !p)) return { error: 'Rellena las tres palabras.' };
    const repetidas = new Set(palabras.map(p => p.toLocaleLowerCase('es'))).size !== 3;
    if (repetidas) return { error: 'Las tres palabras tienen que ser distintas.' };
    datos.palabras = palabras;
  }
  return { datos };
}

// Lo que ve cualquiera que consulta la sesión: nunca las palabras ni los tokens.
export function vistaPublica(sesion) {
  return {
    codigo: sesion.codigo,
    estado: sesion.estado,
    duracion: sesion.duracion,
    jugadores: sesion.jugadores.map(({ id, nombre, grupo }) => ({ id, nombre, grupo })),
  };
}
