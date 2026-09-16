# IntegraMédica Browser Worker

## Preparar la agenda oficial (pendiente de validar desplegado en Cloudflare)

`POST /preparar-reserva` completa RUT/previsión, busca al profesional, elige
especialidad y prestación presencial, abre el calendario, selecciona fecha/hora
y llega a **Confirma y reserva**. No presiona **Reservar** y no ejecuta ni reutiliza
tokens de CAPTCHA. La confirmación se realiza en la página oficial mediante Live View.

El recorrido se verificó interactivamente el 16/09/2026 hasta la pantalla final.
El módulo Puppeteer tiene validación de sintaxis y pruebas unitarias, pero **todavía
no se ejecutó desplegado en Cloudflare**. No equivale a una reserva confirmada.

La búsqueda inicial por API puede mantenerse en el otro Worker. Esta ruta prepara
el formulario en la misma sesión que verá el usuario.

### Petición desde consola

Después de desplegar esta versión, ejecutar desde un origen que permita conectarse
al Worker. Los prompts evitan guardar datos personales en el repositorio.

```js
const entrada = {
  paciente: {
    rut: prompt('RUT del paciente'),
    previsionNombre: 'Isapre Cruz Blanca'
  },
  reserva: {
    profesionalNombre: 'Leonardo Esteban Garcia Gonzalez',
    profesionalBusqueda: 'Garcia',
    especialidadNombre: 'Medicina General (mayor a 15 años)',
    prestacionNombre: 'Consulta Medicina General adulto',
    centroNombre: 'IntegraMédica Plaza Egaña',
    modalidad: 'presencial',
    fecha: prompt('Fecha real disponible (AAAA-MM-DD)'),
    hora: prompt('Hora real disponible (HH:MM)')
  }
};
const response = await fetch(
  'https://integramedica-browser.pirqueporton.workers.dev/preparar-reserva',
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(entrada)}
);
const resultado = await response.json();
console.log(resultado);
// Abrir resultado.liveViewUrl para revisar la página preparada.
// lista_para_confirmar NO significa reserva realizada.
```

### Estados y límites

- `lista_para_confirmar`: el resumen final coincide con fecha/hora/centro.
- `preparacion_incompleta`: fallo en `paso`; el enlace, si se pudo generar,
  permite revisar dónde se detuvo. No se presenta como CAPTCHA pendiente.
- `datos_incompletos`: entrada rechazada antes de abrir el navegador.
- Primera versión: presencial, desde hoy hasta 29 días después, paciente existente
  y etiquetas del formulario observadas. Pacientes nuevos, cambios de contacto,
  homónimos indistinguibles y nuevos diseños requieren soporte.
- El nombre del profesional admite distinto orden de palabras, pero exige todas
  las palabras y una opción única. Usar el nombre del catálogo.
- Sesión: hasta 10 minutos de inactividad. Enlace: 10 minutos para conectarse.
  El enlace no revive una sesión vencida. No publicar enlaces Live View.
- La integración del resultado final con SmartHub y la reanudación automática
  todavía están pendientes.

Las rutas anteriores `/flujo-completo`, `/continuar-verificacion` y
`/validar-payload` siguen siendo el flujo experimental API-first. No se han
corregido ni deben mezclarse con sesiones de `/preparar-reserva`: todavía intentan
obtener y enviar CAPTCHA fuera de la navegación oficial y pueden fallar.
Usar sólo la ruta nueva para probar esta preparación.

## Despliegue y verificación

Se conserva `wrangler.jsonc` y el binding `BROWSER`. Importar el repositorio desde
Cloudflare o ejecutar `npm install` y `npm run deploy` en un entorno habilitado.
Crear una rama/PR no cambia producción.

```sh
node --check index.js
node --check preparar-reserva.js
node --test preparar-reserva.test.js
```

Pendiente: desplegar en un Worker de prueba, invocar la nueva ruta, comprobar
el resumen y completar únicamente la confirmación/verificación oficial si se desea
reservar. No generar reservas repetidas como prueba automática.
