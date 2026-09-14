import puppeteer from "@cloudflare/puppeteer";

const AGENDA_CONFIRM_URL =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-confirmar-hora";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}

async function crearLiveView(page) {
  const cdp = await page.createCDPSession();

  const { devtoolsFrontendUrl } = await cdp.send(
    "Cloudflare.getLiveView",
    {
      mode: "tab",
      expiresInMs: 300000,
    }
  );

  return devtoolsFrontendUrl;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    // =====================================================
    // INICIO
    // =====================================================
    if (url.pathname === "/") {
      return json({
        ok: true,
        servicio: "IntegraMedica Browser",
        rutas: [
          "/sessions",
          "/finalizar-reserva"
        ],
      });
    }

    // =====================================================
    // CONSULTAR SESIONES - NO CREA BROWSER
    // =====================================================
    if (url.pathname === "/sessions") {
      try {
        const sesiones =
          await puppeteer.sessions(env.BROWSER);

        return json({
          ok: true,
          sesiones,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            paso: "sessions",
            error: String(error?.stack || error),
          },
          500
        );
      }
    }

    // =====================================================
    // FINALIZAR RESERVA
    // =====================================================
    if (
      url.pathname === "/finalizar-reserva" &&
      request.method === "POST"
    ) {
      let browser = null;
      let mantenerSesion = false;

      try {
        const entrada = await request.json();

        // -------------------------------------------------
        // 1) Confirmación explícita
        // -------------------------------------------------
        if (entrada.confirmar !== true) {
          return json(
            {
              ok: false,
              estado: "requiere_confirmacion",
              mensaje:
                "La reserva requiere confirmación explícita.",
            },
            400
          );
        }

        if (!entrada.bupaCitaRequest) {
          return json(
            {
              ok: false,
              estado: "datos_incompletos",
              mensaje: "Falta bupaCitaRequest.",
            },
            400
          );
        }

        // -------------------------------------------------
        // 2) Verificar límites ANTES de abrir browser
        // -------------------------------------------------
        const limites =
          await puppeteer.limits(env.BROWSER);

        if (
          typeof limites.allowedBrowserAcquisitions ===
            "number" &&
          limites.allowedBrowserAcquisitions < 1
        ) {
          return json(
            {
              ok: false,
              estado: "browser_no_disponible",
              mensaje:
                "Cloudflare no permite abrir una nueva sesión en este momento.",
              timeUntilNextAllowedBrowserAcquisition:
                limites.timeUntilNextAllowedBrowserAcquisition,
            },
            429
          );
        }

        // -------------------------------------------------
        // 3) Abrir UNA sesión corta
        // -------------------------------------------------
        browser = await puppeteer.launch(
          env.BROWSER,
          {
            keep_alive: 30000,
          }
        );

        const sessionId =
          browser.sessionId();

        const page =
          await browser.newPage();

        page.setDefaultTimeout(12000);
        page.setDefaultNavigationTimeout(20000);

        // -------------------------------------------------
        // 4) Abrir pantalla final Bupa
        // -------------------------------------------------
        await page.goto(
          AGENDA_CONFIRM_URL,
          {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          }
        );

        await new Promise(resolve =>
          setTimeout(resolve, 2500)
        );

        // -------------------------------------------------
        // 5) Inspección mínima
        // NO intenta fabricar captcha
        // -------------------------------------------------
        const estado = await page.evaluate(() => {
          const texto =
            document.body?.innerText || "";

          const scripts =
            Array.from(document.scripts)
              .map(s => s.src)
              .filter(Boolean);

          const tieneRecaptchaScript =
            scripts.some(src =>
              /recaptcha|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
                src
              )
            );

          const grecaptcha =
            typeof window.grecaptcha !== "undefined";

          const enterprise =
            typeof window.grecaptcha !== "undefined" &&
            typeof window.grecaptcha.enterprise !==
              "undefined";

          const posiblesBotones =
            Array.from(
              document.querySelectorAll(
                "button, input[type='submit']"
              )
            )
              .map(el => ({
                texto:
                  (
                    el.innerText ||
                    el.value ||
                    ""
                  ).trim(),
                disabled:
                  Boolean(el.disabled),
              }))
              .filter(x => x.texto);

          return {
            href: location.href,
            title: document.title,
            tieneRecaptchaScript,
            grecaptcha,
            enterprise,
            textoVisible:
              texto.substring(0, 1500),
            botones:
              posiblesBotones.slice(0, 20),
          };
        });

        // -------------------------------------------------
        // 6) Generar Live View SOLO para esta prueba
        // -------------------------------------------------
        const liveViewUrl =
          await crearLiveView(page);

        // -------------------------------------------------
        // IMPORTANTE
        // Todavía NO mandamos reservahora.
        //
        // Esta ejecución sirve para verificar si entrar
        // directamente a reserva-confirmar-hora conserva
        // o no el contexto necesario de Bupa.
        //
        // Dejamos la sesión disponible SOLO si realmente
        // necesitamos verla manualmente.
        // -------------------------------------------------
        mantenerSesion = true;

        browser.disconnect();
        browser = null;

        return json({
          ok: true,
          estado: "inspeccion_final_lista",
          sessionId,
          pagina: estado,
          liveViewUrl,
          mensaje:
            "No se ha enviado ninguna reserva todavía. Revisar la pantalla final y continuar sobre esta misma sesión.",
        });
      } catch (error) {
        return json(
          {
            ok: false,
            estado: "error_finalizar_reserva",
            error: String(error?.stack || error),
          },
          500
        );
      } finally {
        // Si hubo error, cerrar SIEMPRE el browser.
        if (
          browser &&
          !mantenerSesion
        ) {
          try {
            await browser.close();
          } catch (_) {}
        }
      }
    }

    return json(
      {
        ok: false,
        error: "Ruta no encontrada",
      },
      404
    );
  },
};
