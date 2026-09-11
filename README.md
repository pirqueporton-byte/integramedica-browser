# IntegraMédica Browser Worker

Primera prueba de Cloudflare Browser Run para abrir `agenda.bupa.cl`
y obtener una URL de Live View de la misma sesión.

## Archivos

- `package.json`
- `wrangler.jsonc`
- `src/index.js`

## Despliegue desde GitHub + Cloudflare

1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. En Cloudflare: Workers & Pages → Create → Import repository.
3. Selecciona el repositorio.
4. Deja que Cloudflare instale dependencias y despliegue.
5. En el Worker desplegado confirma que exista el binding Browser Run:
   - Binding name: `BROWSER`
6. Visita:
   - `/browser-test`
7. Si funciona, la respuesta incluye:
   - `sessionId`
   - `currentUrl`
   - `liveViewUrl`
8. Abre `liveViewUrl` inmediatamente. El enlace expira en 5 minutos.
9. `/sessions` muestra sesiones abiertas.

## Importante

Este proyecto solo abre la agenda y habilita Live View.
Todavía no automatiza la reserva ni intenta eludir CAPTCHA.
