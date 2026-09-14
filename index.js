// @ts-nocheck

import puppeteer from "@cloudflare/puppeteer";

const AGENDA_URL =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica";

const RESERVA_ENDPOINT =
  "/agenda/ms-sap/reserva/reservahora";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });
}

function normalizar(texto = "") {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function pausa(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function liveView(page) {
  const cdp = await page.createCDPSession();

  const { devtoolsFrontendUrl } = await cdp.send(
    "Cloudflare.getLiveView",
    {
      mode: "tab",
      expiresInMs: 300000
    }
  );

  return devtoolsFrontendUrl;
}

async function obtenerPagina(browser) {
  const pages = await browser.pages();

  if (!pages.length) {
    return await browser.newPage();
  }

  return (
    pages.find(p =>
      p.url().includes("agenda.bupa.cl")
    ) ||
    pages[pages.length - 1]
  );
}

// ========================================================
// BUSCAR Y HACER CLICK POR TEXTO VISIBLE
// ========================================================

async function clickTexto(
  page,
  textos,
  opciones = {}
) {
  if (!Array.isArray(textos)) {
    textos = [textos];
  }

  const exacto =
    opciones.exacto ?? false;

  const resultado =
    await page.evaluate(
      ({ textos, exacto }) => {
        function norm(t = "") {
          return t
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        }

        const buscados =
          textos.map(norm);

        const candidatos =
          Array.from(
            document.querySelectorAll(
              [
                "button",
                "a",
                "[role='button']",
                "[role='option']",
                "label",
                "li",
                "mat-option",
                ".mat-option",
                ".mat-mdc-option"
              ].join(",")
            )
          );

        const visibles =
          candidatos.filter(el => {
            const r =
              el.getBoundingClientRect();

            const style =
              getComputedStyle(el);

            return (
              r.width > 0 &&
              r.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          });

        let elegido = null;

        for (const buscado of buscados) {
          elegido =
            visibles.find(el => {
              const texto =
                norm(
                  el.innerText ||
                  el.textContent ||
                  el.getAttribute("aria-label") ||
                  el.value ||
                  ""
                );

              return exacto
                ? texto === buscado
                : texto.includes(buscado);
            });

          if (elegido) break;
        }

        if (!elegido) {
          return false;
        }

        elegido.scrollIntoView({
          block: "center",
          inline: "center"
        });

        elegido.click();

        return true;
      },
      {
        textos,
        exacto
      }
    );

  if (resultado) {
    await pausa(
      opciones.espera ?? 700
    );
  }

  return resultado;
}

// ========================================================
// COMPLETAR INPUT POR LABEL / PLACEHOLDER
// ========================================================

async function llenarCampo(
  page,
  nombres,
  valor
) {
  if (!Array.isArray(nombres)) {
    nombres = [nombres];
  }

  const selector =
    await page.evaluate(nombres => {
      function norm(t = "") {
        return t
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      }

      const buscados =
        nombres.map(norm);

      const inputs =
        Array.from(
          document.querySelectorAll(
            "input, textarea"
          )
        );

      for (let i = 0; i < inputs.length; i++) {
        const input =
          inputs[i];

        const id =
          input.id || "";

        const label =
          id
            ? document.querySelector(
                `label[for="${CSS.escape(id)}"]`
              )
            : null;

        const wrapper =
          input.closest(
            "div, mat-form-field, form"
          );

        const contexto =
          norm(
            [
              input.placeholder,
              input.name,
              input.id,
              input.getAttribute(
                "aria-label"
              ),
              label?.innerText,
              wrapper?.innerText
            ]
              .filter(Boolean)
              .join(" ")
          );

        if (
          buscados.some(x =>
            contexto.includes(x)
          )
        ) {
          if (!input.id) {
            input.id =
              `auto-field-${i}-${Date.now()}`;
          }

          return `#${CSS.escape(
            input.id
          )}`;
        }
      }

      return null;
    }, nombres);

  if (!selector) {
    return false;
  }

  const input =
    await page.$(selector);

  if (!input) {
    return false;
  }

  await input.click({
    clickCount: 3
  });

  await page.keyboard.press(
    "Backspace"
  );

  await input.type(
    String(valor),
    {
      delay: 30
    }
  );

  await pausa(400);

  return true;
}

// ========================================================
// SELECCIONAR OPCIÓN DE UN DROPDOWN
// ========================================================

async function seleccionarOpcion(
  page,
  campo,
  valor
) {
  // Primero intentamos un <select> nativo.
  const nativo =
    await page.evaluate(
      ({ campo, valor }) => {
        function norm(t = "") {
          return t
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        }

        const campoN =
          norm(campo);

        const valorN =
          norm(valor);

        const selects =
          Array.from(
            document.querySelectorAll(
              "select"
            )
          );

        for (const select of selects) {
          const contexto =
            norm(
              [
                select.name,
                select.id,
                select.getAttribute(
                  "aria-label"
                ),
                select.closest("div")
                  ?.innerText
              ]
                .filter(Boolean)
                .join(" ")
            );

          if (
            !contexto.includes(
              campoN
            )
          ) {
            continue;
          }

          const option =
            Array.from(
              select.options
            ).find(o =>
              norm(o.textContent)
                .includes(valorN)
            );

          if (!option) {
            continue;
          }

          select.value =
            option.value;

          select.dispatchEvent(
            new Event("change", {
              bubbles: true
            })
          );

          return true;
        }

        return false;
      },
      {
        campo,
        valor
      }
    );

  if (nativo) {
    await pausa(700);
    return true;
  }

  // Dropdown Angular / Material / custom.
  const abierto =
    await clickTexto(
      page,
      campo,
      {
        exacto: false,
        espera: 500
      }
    );

  if (!abierto) {
    return false;
  }

  const elegido =
    await clickTexto(
      page,
      valor,
      {
        exacto: false,
        espera: 800
      }
    );

  return elegido;
}

// ========================================================
// DETECTAR CAPTCHA VISUAL
// ========================================================

async function captchaVisual(page) {
  return await page.evaluate(() => {
    const iframes =
      Array.from(
        document.querySelectorAll(
          "iframe"
        )
      );

    return iframes.some(frame => {
      const src =
        frame.src || "";

      if (
        !/recaptcha|captcha/i.test(
          src
        )
      ) {
        return false;
      }

      const r =
        frame.getBoundingClientRect();

      return (
        r.width > 100 &&
        r.height > 100
      );
    });
  });
}

// ========================================================
// ESTADO DE LA PÁGINA
// ========================================================

async function estadoPagina(page) {
  return await page.evaluate(() => ({
    url: location.href,

    title:
      document.title,

    texto:
      (
        document.body?.innerText ||
        ""
      ).substring(0, 2000),

    botones:
      Array.from(
        document.querySelectorAll(
          "button, [role='button']"
        )
      )
        .map(el =>
          (
            el.innerText ||
            el.getAttribute(
              "aria-label"
            ) ||
            ""
          ).trim()
        )
        .filter(Boolean)
        .slice(0, 30),

    grecaptcha:
      typeof window.grecaptcha !==
      "undefined"
  }));
}

// ========================================================
// ESPERAR POST /reservahora
// ========================================================

async function esperarReserva(
  page,
  timeout = 25000
) {
  try {
    const response =
      await page.waitForResponse(
        response =>
          response
            .url()
            .includes(
              RESERVA_ENDPOINT
            ) &&
          response
            .request()
            .method() === "POST",
        {
          timeout
        }
      );

    const texto =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(texto);
    } catch {
      data = {
        raw: texto
      };
    }

    return {
      detectada: true,
      httpStatus:
        response.status(),
      data
    };

  } catch (_) {
    return {
      detectada: false
    };
  }
}

// ========================================================
// PULSAR RESERVAR Y ESPERAR RESULTADO
// ========================================================

async function ejecutarReserva(
  page
) {
  const esperaReserva =
    esperarReserva(
      page,
      25000
    );

  const click =
    await clickTexto(
      page,
      ["Reservar"],
      {
        exacto: true,
        espera: 200
      }
    );

  if (!click) {
    return {
      ok: false,
      estado:
        "boton_reservar_no_encontrado"
    };
  }

  const reserva =
    await esperaReserva;

  if (reserva.detectada) {
    const data =
      reserva.data;

    const idCita =
      data?.data?.IdCita ||
      data?.IdCita ||
      data?.data?.idCita ||
      "";

    const tipo =
      data?.data?.Estatus?.Tipo;

    if (
      reserva.httpStatus >= 200 &&
      reserva.httpStatus < 300 &&
      (
        idCita ||
        tipo === "S"
      )
    ) {
      return {
        ok: true,
        estado:
          "reservada",
        idCita,
        respuestaBupa:
          data
      };
    }

    return {
      ok: false,
      estado:
        "respuesta_reserva_error",
      httpStatus:
        reserva.httpStatus,
      respuestaBupa:
        data
    };
  }

  await pausa(1000);

  if (
    await captchaVisual(page)
  ) {
    return {
      ok: false,
      estado:
        "requiere_verificacion"
    };
  }

  return {
    ok: false,
    estado:
      "sin_respuesta_reserva"
  };
}

// ========================================================
// AVANZAR FLUJO UI
// ========================================================

async function avanzarFlujo(
  page,
  entrada
) {
  const {
    paciente = {},
    reserva = {}
  } = entrada;

  // ------------------------------------------------------
  // RUT
  // ------------------------------------------------------

  if (paciente.rut) {
    await llenarCampo(
      page,
      [
        "rut",
        "documento",
        "rut paciente"
      ],
      paciente.rut
    );

    await pausa(500);
  }

  // ------------------------------------------------------
  // PREVISIÓN
  // ------------------------------------------------------

  if (paciente.prevision) {
    await seleccionarOpcion(
      page,
      "prevision",
      paciente.prevision
    );

    await pausa(500);
  }

  // ------------------------------------------------------
  // CONTINUAR PRIMER PASO
  // ------------------------------------------------------

  await clickTexto(
    page,
    [
      "Continuar",
      "Buscar"
    ],
    {
      exacto: false,
      espera: 1200
    }
  );

  // ------------------------------------------------------
  // ESPECIALIDAD
  // ------------------------------------------------------

  if (reserva.especialidad) {
    await seleccionarOpcion(
      page,
      "especialidad",
      reserva.especialidad
    );

    await pausa(500);
  }

  // ------------------------------------------------------
  // CENTRO
  // ------------------------------------------------------

  if (reserva.centro) {
    await seleccionarOpcion(
      page,
      "centro",
      reserva.centro
    );

    await pausa(500);
  }

  await clickTexto(
    page,
    [
      "Buscar",
      "Continuar"
    ],
    {
      exacto: false,
      espera: 1800
    }
  );

  // ------------------------------------------------------
  // PROFESIONAL
  // ------------------------------------------------------

  if (reserva.profesional) {
    await clickTexto(
      page,
      reserva.profesional,
      {
        exacto: false,
        espera: 800
      }
    );
  }

  // ------------------------------------------------------
  // FECHA
  // ------------------------------------------------------

  if (
    reserva.fechaTexto ||
    reserva.fecha
  ) {
    await clickTexto(
      page,
      [
        reserva.fechaTexto,
        reserva.fecha
      ].filter(Boolean),
      {
        exacto: false,
        espera: 700
      }
    );
  }

  // ------------------------------------------------------
  // HORA
  // ------------------------------------------------------

  if (reserva.hora) {
    const horaCorta =
      String(
        reserva.hora
      ).substring(0, 5);

    const horaSeleccionada =
      await clickTexto(
        page,
        [
          reserva.hora,
          horaCorta
        ],
        {
          exacto: false,
          espera: 800
        }
      );

    if (!horaSeleccionada) {
      throw new Error(
        `No se encontró la hora ${reserva.hora}`
      );
    }
  }

  // ------------------------------------------------------
  // CONTINUAR HASTA CONFIRMACIÓN
  // ------------------------------------------------------

  for (
    let intento = 0;
    intento < 4;
    intento++
  ) {
    if (
      page
        .url()
        .includes(
          "reserva-confirmar-hora"
        )
    ) {
      break;
    }

    const pudo =
      await clickTexto(
        page,
        ["Continuar"],
        {
          exacto: true,
          espera: 1200
        }
      );

    if (!pudo) {
      break;
    }
  }

  await pausa(1200);

  return await estadoPagina(
    page
  );
}

// ========================================================
// WORKER
// ========================================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    // ====================================================
    // CORS
    // ====================================================

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        headers: {
          "access-control-allow-origin":
            "*",
          "access-control-allow-methods":
            "GET,POST,OPTIONS",
          "access-control-allow-headers":
            "content-type"
        }
      });
    }

    // ====================================================
    // HOME
    // ====================================================

    if (url.pathname === "/") {
      return json({
        ok: true,
        servicio:
          "IntegraMedica Browser",
        rutas: [
          "/sessions",
          "POST /flujo-completo",
          "POST /continuar-verificacion",
          "/cerrar?sessionId=..."
        ]
      });
    }

    // ====================================================
    // SESIONES
    // ====================================================

    if (
      url.pathname ===
      "/sessions"
    ) {
      try {
        return json({
          ok: true,
          sesiones:
            await puppeteer.sessions(
              env.BROWSER
            )
        });

      } catch (error) {
        return json(
          {
            ok: false,
            error:
              String(
                error?.stack ||
                error
              )
          },
          500
        );
      }
    }

    // ====================================================
    // FLUJO COMPLETO
    // ====================================================

    if (
      url.pathname ===
        "/flujo-completo" &&
      request.method === "POST"
    ) {
      let browser = null;
      let mantener =
        false;

      try {
        const entrada =
          await request.json();

        // Seguridad:
        // nunca reservar sin confirmación explícita.
        if (
          entrada.confirmar !==
          true
        ) {
          return json(
            {
              ok: false,
              estado:
                "requiere_confirmacion"
            },
            400
          );
        }

        if (
          !entrada?.paciente?.rut
        ) {
          return json(
            {
              ok: false,
              estado:
                "datos_incompletos",
              faltante:
                "paciente.rut"
            },
            400
          );
        }

        if (
          !entrada?.reserva?.hora
        ) {
          return json(
            {
              ok: false,
              estado:
                "datos_incompletos",
              faltante:
                "reserva.hora"
            },
            400
          );
        }

        // ------------------------------------------------
        // UNA sola sesión Browser Run
        // ------------------------------------------------

        browser =
          await puppeteer.launch(
            env.BROWSER,
            {
              // Máximo práctico corto.
              // Si algo falla y el Worker muere,
              // la sesión expira pronto.
              keep_alive:
                60000
            }
          );

        const sessionId =
          browser.sessionId();

        const page =
          await browser.newPage();

        page.setDefaultTimeout(
          10000
        );

        page.setDefaultNavigationTimeout(
          20000
        );

        await page.goto(
          AGENDA_URL,
          {
            waitUntil:
              "domcontentloaded",
            timeout:
              20000
          }
        );

        await pausa(1200);

        // ------------------------------------------------
        // Recorrer Bupa
        // ------------------------------------------------

        const pagina =
          await avanzarFlujo(
            page,
            entrada
          );

        // ------------------------------------------------
        // Debemos haber llegado a confirmación
        // ------------------------------------------------

        if (
          !page
            .url()
            .includes(
              "reserva-confirmar-hora"
            )
        ) {
          const lv =
            await liveView(page);

          mantener = true;

          browser.disconnect();
          browser = null;

          return json({
            ok: false,
            estado:
              "requiere_intervencion",
            motivo:
              "No fue posible llegar automáticamente a la pantalla final.",
            sessionId,
            liveViewUrl:
              lv,
            pagina
          });
        }

        // ------------------------------------------------
        // reCAPTCHA debe estar cargado
        // ------------------------------------------------

        const captchaListo =
          await page.evaluate(
            () =>
              typeof window.grecaptcha !==
              "undefined"
          );

        if (!captchaListo) {
          const lv =
            await liveView(page);

          mantener = true;

          browser.disconnect();
          browser = null;

          return json({
            ok: false,
            estado:
              "requiere_intervencion",
            motivo:
              "La pantalla final cargó, pero reCAPTCHA aún no está disponible.",
            sessionId,
            liveViewUrl:
              lv
          });
        }

        // ------------------------------------------------
        // RESERVAR
        // ------------------------------------------------

        const resultado =
          await ejecutarReserva(
            page
          );

        // ------------------------------------------------
        // ÉXITO
        // ------------------------------------------------

        if (
          resultado.estado ===
          "reservada"
        ) {
          await browser.close();

          browser = null;

          return json({
            ok: true,
            estado:
              "reservada",
            idCita:
              resultado.idCita ||
              null,
            respuestaBupa:
              resultado.respuestaBupa
          });
        }

        // ------------------------------------------------
        // CAPTCHA HUMANO
        // ------------------------------------------------

        if (
          resultado.estado ===
          "requiere_verificacion"
        ) {
          const lv =
            await liveView(page);

          mantener = true;

          browser.disconnect();
          browser = null;

          return json({
            ok: false,
            estado:
              "requiere_verificacion",
            sessionId,
            liveViewUrl:
              lv,
            mensaje:
              "Bupa requiere verificación humana. Resuélvela en Live View y luego llama /continuar-verificacion."
          });
        }

        // ------------------------------------------------
        // CUALQUIER OTRO ESTADO
        // ------------------------------------------------

        const paginaFinal =
          await estadoPagina(
            page
          );

        await browser.close();
        browser = null;

        return json(
          {
            ok: false,
            ...resultado,
            pagina:
              paginaFinal
          },
          400
        );

      } catch (error) {
        if (
          browser &&
          !mantener
        ) {
          try {
            await browser.close();
          } catch (_) {}
        }

        return json(
          {
            ok: false,
            estado:
              "error_flujo",
            error:
              String(
                error?.stack ||
                error
              )
          },
          500
        );
      }
    }

    // ====================================================
    // CONTINUAR DESPUÉS DE CAPTCHA HUMANO
    // ====================================================

    if (
      url.pathname ===
        "/continuar-verificacion" &&
      request.method === "POST"
    ) {
      let browser =
        null;

      try {
        const entrada =
          await request.json();

        if (
          entrada.confirmar !==
          true
        ) {
          return json(
            {
              ok: false,
              estado:
                "requiere_confirmacion"
            },
            400
          );
        }

        if (
          !entrada.sessionId
        ) {
          return json(
            {
              ok: false,
              error:
                "Falta sessionId"
            },
            400
          );
        }

        browser =
          await puppeteer.connect(
            env.BROWSER,
            entrada.sessionId
          );

        const page =
          await obtenerPagina(
            browser
          );

        // Damos un momento a Bupa
        // después de la resolución humana.
        await pausa(800);

        // Puede que la reserva ya se haya enviado
        // automáticamente al terminar CAPTCHA.
        // Si no, volvemos a pulsar Reservar.
        const resultado =
          await ejecutarReserva(
            page
          );

        if (
          resultado.estado ===
          "reservada"
        ) {
          await browser.close();

          browser = null;

          return json({
            ok: true,
            estado:
              "reservada",
            idCita:
              resultado.idCita ||
              null,
            respuestaBupa:
              resultado.respuestaBupa
          });
        }

        if (
          resultado.estado ===
          "requiere_verificacion"
        ) {
          const lv =
            await liveView(page);

          browser.disconnect();
          browser = null;

          return json({
            ok: false,
            estado:
              "requiere_verificacion",
            sessionId:
              entrada.sessionId,
            liveViewUrl:
              lv
          });
        }

        const pagina =
          await estadoPagina(
            page
          );

        await browser.close();

        browser = null;

        return json(
          {
            ok: false,
            ...resultado,
            pagina
          },
          400
        );

      } catch (error) {
        try {
          if (browser) {
            await browser.close();
          }
        } catch (_) {}

        return json(
          {
            ok: false,
            estado:
              "error_continuar",
            error:
              String(
                error?.stack ||
                error
              )
          },
          500
        );
      }
    }

    // ====================================================
    // CERRAR MANUALMENTE
    // ====================================================

    if (
      url.pathname ===
      "/cerrar"
    ) {
      const sessionId =
        url.searchParams.get(
          "sessionId"
        );

      if (!sessionId) {
        return json(
          {
            ok: false,
            error:
              "Falta sessionId"
          },
          400
        );
      }

      try {
        const browser =
          await puppeteer.connect(
            env.BROWSER,
            sessionId
          );

        await browser.close();

        return json({
          ok: true,
          estado:
            "sesion_cerrada"
        });

      } catch (error) {
        return json(
          {
            ok: false,
            estado:
              "sesion_no_disponible",
            mensaje:
              "La sesión probablemente ya expiró o fue cerrada."
          },
          404
        );
      }
    }

    return json(
      {
        ok: false,
        error:
          "Ruta no encontrada"
      },
      404
    );
  }
};
