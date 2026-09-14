// @ts-nocheck

import puppeteer from "@cloudflare/puppeteer";

const AGENDA_URL =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica";

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

  const agenda =
    pages.find(p =>
      p.url().includes("agenda.bupa.cl")
    );

  return agenda || pages[pages.length - 1];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =====================================================
    // CORS
    // =====================================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type"
        }
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
          "/iniciar-flujo",
          "/estado?sessionId=...",
          "/cerrar?sessionId=..."
        ]
      });
    }

    // =====================================================
    // SESIONES ACTIVAS
    // NO CREA BROWSER
    // =====================================================
    if (url.pathname === "/sessions") {
      try {
        const sesiones =
          await puppeteer.sessions(env.BROWSER);

        return json({
          ok: true,
          sesiones
        });

      } catch (error) {
        return json({
          ok: false,
          error: String(error?.stack || error)
        }, 500);
      }
    }

    // =====================================================
    // INICIAR UNA ÚNICA SESIÓN
    // =====================================================
    if (url.pathname === "/iniciar-flujo") {
      let browser = null;

      try {
        // IMPORTANTE:
        // 30 segundos de INACTIVIDAD.
        // No dejamos 10 minutos como la vez anterior.
        browser = await puppeteer.launch(
          env.BROWSER,
          {
            keep_alive: 30000
          }
        );

        const sessionId =
          browser.sessionId();

        const page =
          await browser.newPage();

        page.setDefaultTimeout(12000);

        await page.goto(
          AGENDA_URL,
          {
            waitUntil: "domcontentloaded",
            timeout: 20000
          }
        );

        await new Promise(resolve =>
          setTimeout(resolve, 1500)
        );

        const liveViewUrl =
          await liveView(page);

        const resultado = {
          ok: true,
          estado: "sesion_lista",
          sessionId,
          liveViewUrl,
          url: page.url(),
          mensaje:
            "Abre Live View inmediatamente y avanza solo hasta la pantalla final antes de reservar."
        };

        // La dejamos viva para Live View.
        browser.disconnect();
        browser = null;

        return json(resultado);

      } catch (error) {
        if (browser) {
          try {
            await browser.close();
          } catch (_) {}
        }

        return json({
          ok: false,
          estado: "error_iniciar",
          error: String(error?.stack || error)
        }, 500);
      }
    }

    // =====================================================
    // INSPECCIONAR LA MISMA SESIÓN
    // NO CREA OTRA
    // =====================================================
    if (url.pathname === "/estado") {
      const sessionId =
        url.searchParams.get("sessionId");

      if (!sessionId) {
        return json({
          ok: false,
          error: "Falta sessionId"
        }, 400);
      }

      let browser = null;

      try {
        browser = await puppeteer.connect(
          env.BROWSER,
          sessionId
        );

        const page =
          await obtenerPagina(browser);

        const estado =
          await page.evaluate(() => {
            const scripts =
              Array.from(document.scripts)
                .map(s => s.src)
                .filter(Boolean);

            const botones =
              Array.from(
                document.querySelectorAll(
                  "button, input[type='submit'], [role='button']"
                )
              )
                .map(el => ({
                  texto:
                    (
                      el.innerText ||
                      el.value ||
                      el.getAttribute("aria-label") ||
                      ""
                    ).trim(),

                  disabled:
                    Boolean(el.disabled)
                }))
                .filter(x => x.texto)
                .slice(0, 30);

            return {
              href: location.href,

              title: document.title,

              tieneRecaptchaScript:
                scripts.some(src =>
                  /recaptcha|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
                    src
                  )
                ),

              grecaptcha:
                typeof window.grecaptcha !==
                "undefined",

              enterprise:
                typeof window.grecaptcha !==
                  "undefined" &&
                typeof window.grecaptcha.enterprise !==
                  "undefined",

              botones
            };
          });

        const nuevaLiveView =
          await liveView(page);

        browser.disconnect();
        browser = null;

        return json({
          ok: true,
          estado: "sesion_inspeccionada",
          sessionId,
          pagina: estado,
          liveViewUrl: nuevaLiveView
        });

      } catch (error) {
        if (browser) {
          try {
            browser.disconnect();
          } catch (_) {}
        }

        return json({
          ok: false,
          estado: "error_estado",
          error: String(error?.stack || error)
        }, 500);
      }
    }

    // =====================================================
    // CERRAR LA SESIÓN INMEDIATAMENTE
    // =====================================================
    if (url.pathname === "/cerrar") {
      const sessionId =
        url.searchParams.get("sessionId");

      if (!sessionId) {
        return json({
          ok: false,
          error: "Falta sessionId"
        }, 400);
      }

      let browser = null;

      try {
        browser = await puppeteer.connect(
          env.BROWSER,
          sessionId
        );

        await browser.close();

        browser = null;

        return json({
          ok: true,
          estado: "sesion_cerrada",
          sessionId
        });

      } catch (error) {
        return json({
          ok: false,
          estado: "error_cerrar",
          error: String(error?.stack || error)
        }, 500);
      }
    }

    return json({
      ok: false,
      error: "Ruta no encontrada"
    }, 404);
  }
};
