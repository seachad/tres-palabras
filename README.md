# Tres palabras

Juego de grupo para jugar en persona con un solo móvil que se pasa de mano en mano.

1. Alguien **crea la partida** en su móvil (el anfitrión).
2. Cada persona entra desde su móvil con el **código** (o el enlace), elige **grupo A o B** y escribe **tres palabras**. Nadie más las ve.
3. El anfitrión pulsa **Empezar**. A partir de ahí se juega solo con su móvil, que va pasando de jugador en jugador.

Hay **tres rondas** con las mismas palabras:

| Ronda | Cómo se juega |
|---|---|
| 1 · Explicar | Todas las palabras que quieras, sin decir la palabra. |
| 2 · Una palabra | Solo una palabra relacionada. |
| 3 · Mímica | Solo gestos. |

- Cada turno dura lo que marque el anfitrión (**1 minuto** por defecto, de 15 s a 5 min).
- Quien presenta pulsa **¡Acertada!** cuando su grupo adivina la palabra y sale la siguiente. **No se puede pasar palabra**; hay un botón para deshacer un toque por error.
- Al acabarse el tiempo, la palabra que estaba en juego vuelve al montón y el móvil pasa al otro grupo. Los presentadores rotan dentro de cada grupo.
- Las palabras salen en orden aleatorio y no se repiten dentro de una ronda. La ronda termina cuando se han adivinado todas.
- Gana el grupo con más palabras adivinadas en las tres rondas.

Hacen falta al menos **dos jugadores por grupo**. Quien no tenga móvil puede apuntarse desde el del anfitrión («Añadir jugador en este móvil»).

## Cómo está hecho

- `web/`: la web, sin dependencias ni compilación (HTML, CSS y JavaScript). `web/juego.js` es el motor del juego.
- `worker/`: un [Cloudflare Worker](https://developers.cloudflare.com/workers/) con un Durable Object por sesión. Solo guarda los jugadores y sus palabras hasta que empieza la partida; **cada sesión se borra a las 24 horas**. Las palabras no se enseñan a nadie salvo al anfitrión al empezar.
- El mismo Worker sirve la web y la API (`/api/sesiones`), así que todo vive en una sola dirección.
- La partida en sí (turnos, reloj, marcador) corre en el móvil del anfitrión y se guarda en su navegador: si se recarga la página, sigue donde estaba.

## Trabajar en local

Requisitos: [Node.js](https://nodejs.org/) 20 o superior.

```bash
git clone https://github.com/seachad/tres-palabras.git C:\Seachad\tres-palabras
cd C:\Seachad\tres-palabras
npm install
npm test          # pruebas del motor y de la validación
npm run dev       # web y API en http://localhost:8787
```

Para probar con varios móviles en la misma wifi: `npx wrangler dev --ip 0.0.0.0` y abrir `http://<IP-del-ordenador>:8787` en cada móvil.

## Publicar

```bash
npx wrangler login    # una vez, abre el navegador para entrar en Cloudflare
npm run deploy
```

Queda en `https://tres-palabras.<tu-subdominio>.workers.dev`. Es gratis dentro del plan gratuito de Cloudflare Workers (Durable Objects con almacenamiento SQLite incluidos).

También se publica sola al subir a `main` si el repositorio tiene los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` (flujo `.github/workflows/desplegar.yml`).
