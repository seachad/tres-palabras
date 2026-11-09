// API de «Tres palabras»: crea sesiones y recoge las tres palabras de cada jugador.
// La web (carpeta web/) la sirve el mismo Worker como ficheros estáticos; el juego corre en el móvil del anfitrión.
import { nuevoCodigo, codigoValido, validarJugador, vistaPublica, duracionValida, MAX_JUGADORES } from './logica.js';

const CADUCIDAD_MS = 24 * 60 * 60 * 1000;

const json = (datos, status = 200) =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const leer = async req => {
  try { return await req.json(); } catch { return {}; }
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const partes = url.pathname.split('/').filter(Boolean); // api, sesiones, CODIGO, ...
    if (partes[0] !== 'api' || partes[1] !== 'sesiones') {
      return env.ASSETS ? env.ASSETS.fetch(req) : json({ error: 'No encontrado.' }, 404);
    }

    if (partes.length === 2 && req.method === 'POST') {
      const cuerpo = await leer(req);
      for (let intento = 0; intento < 8; intento++) {
        const codigo = nuevoCodigo();
        const r = await sesion(env, codigo).fetch('https://sesion/crear', {
          method: 'POST',
          body: JSON.stringify({ codigo, duracion: cuerpo.duracion }),
        });
        if (r.status !== 409) return r;
      }
      return json({ error: 'No se pudo crear la sesión. Inténtalo de nuevo.' }, 503);
    }

    const codigo = (partes[2] || '').toUpperCase();
    if (!codigoValido(codigo)) return json({ error: 'Código de sesión no válido.' }, 400);
    const resto = '/' + partes.slice(3).join('/');
    const destino = new URL('https://sesion' + resto);
    return sesion(env, codigo).fetch(destino, {
      method: req.method,
      headers: { authorization: req.headers.get('authorization') || '' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
    });
  },
};

const sesion = (env, codigo) => env.SESIONES.get(env.SESIONES.idFromName(codigo));

export class Sesion {
  constructor(state) {
    this.state = state;
  }

  async cargar() {
    return (await this.state.storage.get('sesion')) || null;
  }

  async guardar(s) {
    await this.state.storage.put('sesion', s);
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }

  async fetch(req) {
    const url = new URL(req.url);
    const ruta = url.pathname;
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const s = await this.cargar();

    if (ruta === '/crear' && req.method === 'POST') {
      if (s) return json({ error: 'Ya existe.' }, 409);
      const { codigo, duracion } = await leer(req);
      const nueva = {
        codigo,
        estado: 'abierta',
        duracion: duracionValida(duracion) ?? 60,
        anfitrion: crypto.randomUUID(),
        jugadores: [],
        creada: Date.now(),
      };
      await this.guardar(nueva);
      await this.state.storage.setAlarm(Date.now() + CADUCIDAD_MS);
      return json({ ...vistaPublica(nueva), tokenAnfitrion: nueva.anfitrion }, 201);
    }

    if (!s) return json({ error: 'Esa sesión no existe o ha caducado.' }, 404);
    const esAnfitrion = token && token === s.anfitrion;

    if (ruta === '/' && req.method === 'GET') {
      const vista = vistaPublica(s);
      const propio = s.jugadores.find(j => token && j.token === token);
      if (propio) vista.yo = { id: propio.id, nombre: propio.nombre, grupo: propio.grupo, palabras: propio.palabras };
      vista.anfitrion = Boolean(esAnfitrion);
      return json(vista);
    }

    if (ruta === '/jugadores' && req.method === 'POST') {
      if (s.estado !== 'abierta') return json({ error: 'La partida ya ha empezado.' }, 409);
      if (s.jugadores.length >= MAX_JUGADORES) return json({ error: 'La sesión está llena.' }, 409);
      const { datos, error } = validarJugador(await leer(req));
      if (error) return json({ error }, 400);
      const jugador = { id: crypto.randomUUID().slice(0, 8), token: crypto.randomUUID(), ...datos };
      s.jugadores.push(jugador);
      await this.guardar(s);
      return json({ id: jugador.id, token: jugador.token, ...vistaPublica(s) }, 201);
    }

    const m = ruta.match(/^\/jugadores\/([\w-]+)$/);
    if (m) {
      const j = s.jugadores.find(x => x.id === m[1]);
      if (!j) return json({ error: 'Ese jugador no existe.' }, 404);
      if (!esAnfitrion && j.token !== token) return json({ error: 'No autorizado.' }, 403);
      if (s.estado !== 'abierta') return json({ error: 'La partida ya ha empezado.' }, 409);
      if (req.method === 'DELETE') {
        s.jugadores = s.jugadores.filter(x => x !== j);
        await this.guardar(s);
        return json(vistaPublica(s));
      }
      if (req.method === 'PATCH') {
        const entrada = await leer(req);
        // El anfitrión solo cambia el grupo de los demás; las palabras son de cada jugador.
        if (esAnfitrion && j.token !== token) for (const k of ['nombre', 'palabras']) delete entrada[k];
        const { datos, error } = validarJugador(entrada, { parcial: true });
        if (error) return json({ error }, 400);
        Object.assign(j, datos);
        await this.guardar(s);
        return json(vistaPublica(s));
      }
    }

    if (ruta === '/ajustes' && req.method === 'PATCH') {
      if (!esAnfitrion) return json({ error: 'Solo el anfitrión cambia los ajustes.' }, 403);
      const d = duracionValida((await leer(req)).duracion);
      if (d === null) return json({ error: 'La duración va de 15 a 300 segundos.' }, 400);
      s.duracion = d;
      await this.guardar(s);
      return json(vistaPublica(s));
    }

    if (ruta === '/iniciar' && req.method === 'POST') {
      if (!esAnfitrion) return json({ error: 'Solo el anfitrión empieza la partida.' }, 403);
      s.estado = 'jugando';
      await this.guardar(s);
      return json({
        ...vistaPublica(s),
        jugadores: s.jugadores.map(({ id, nombre, grupo, palabras }) => ({ id, nombre, grupo, palabras })),
      });
    }

    if (ruta === '/reabrir' && req.method === 'POST') {
      if (!esAnfitrion) return json({ error: 'No autorizado.' }, 403);
      s.estado = 'abierta';
      await this.guardar(s);
      return json(vistaPublica(s));
    }

    return json({ error: 'No encontrado.' }, 404);
  }
}
