fetch(
  "https://integramedica-browser.pirqueporton.workers.dev/flujo-completo",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      confirmar: true,

      paciente: {
        rut: "TU_RUT",
        prevision: "Cruz Blanca"
      },

      reserva: {
        especialidad:
          "Medicina General (mayor a 15 años)",

        centro:
          "IntegraMédica Plaza Puente Alto",

        profesional:
          "NOMBRE PROFESIONAL",

        fecha:
          "2026-09-24",

        hora:
          "08:45"
      }
    })
  }
)
.then(r => r.json())
.then(console.log);
