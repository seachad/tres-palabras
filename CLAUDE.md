# tres-palabras · Instrucciones para los agentes

## Cómo se explican las cosas

- Explain this using the spirit of ASD STE100. Keep sentence structures direct, limit procedural steps to single actions and avoid unnecessary synonyms.
- En la práctica: frases cortas y directas, en voz activa; cada paso de un procedimiento es una sola acción; un mismo concepto se nombra siempre con la misma palabra (sesión, anfitrión, jugador, grupo, ronda, turno, palabra).

## Proyecto

- Web en `web/` (sin compilación) y servidor en `worker/` (Cloudflare Worker con un Durable Object por sesión). Ver `README.md`.
- Antes de subir cambios: `npm test`.
- Publicar: `npm run deploy` (dirección: https://palabras.pecomac.com).
