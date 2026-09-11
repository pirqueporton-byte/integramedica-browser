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
      "cache-control": "no-store",
    },
  });
}

async function liveView(page) {
  const cdp = await page.createCDPSession();

  const v = await cdp.send("Cloudflare.getLiveView", {
    expiresInMs: 300000,
  });

  return v.devtoolsFrontendUrl;
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

    if (url.pathname === "/") {
      return json({
        ok: true,
        servicio: "IntegraMedica Browser",
        rutas: [
          "/browser-test",
          "/captcha-info",
          "/sessions"
        ],
      });
    }

    // ---------------------------------------------------------
    // PRUEBA DE BROWSER RUN
    // ---------------------------------------------------------
    if (url.pathname === "/browser-test") {
      let browser;

      try {
        browser = await puppeteer.launch(env.BROWSER, {
          keep_alive: 600000,
        });

        const sessionId = browser.sessionId();

        const page = await browser.newPage();

        await page.goto(AGENDA_URL, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });

        const liveViewUrl = await liveView(page);

        const result = {
          ok: true,
          estado: "browser_abierto",
          sessionId,
          title: await page.title(),
          currentUrl: page.url(),
          liveViewUrl,
        };

        // Dejamos la sesión viva
        browser.disconnect();

        return json(result);

      } catch (error) {

        try {
          if (browser) {
            browser.disconnect();
          }
        } catch (_) {}

        return json(
          {
            ok: false,
            paso: "browser-test",
            error: String(error?.stack || error),
          },
          500
        );
      }
    }

    // ---------------------------------------------------------
    // DETECTAR RECAPTCHA / CAPTCHA
    // ---------------------------------------------------------
    if (url.pathname === "/captcha-info") {
      let browser;

      try {

        browser = await puppeteer.launch(env.BROWSER, {
          keep_alive: 600000,
        });

        const sessionId = browser.sessionId();

        const page = await browser.newPage();

        await page.goto(AGENDA_URL, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });

        // Esperamos unos segundos para que carguen scripts diferidos
        await new Promise((resolve) =>
          setTimeout(resolve, 3500)
        );

        const captcha = await page.evaluate(() => {

          // Detectar scripts de reCAPTCHA
          const scripts = Array
            .from(document.scripts)
            .map((s) => s.src)
            .filter(Boolean)
            .filter((src) =>
              /recaptcha|captcha|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(src)
            );

          // Buscar elementos con sitekey
          const siteKeyElements = Array
            .from(
              document.querySelectorAll("[data-sitekey]")
            )
            .map((el) => ({
              tag: el.tagName,
              id: el.id || "",
              sitekey:
                el.getAttribute("data-sitekey") || "",
            }));

          // Buscar textarea que pueda contener token
          const textareas = Array
            .from(
              document.querySelectorAll("textarea")
            )
            .filter((el) =>
              /recaptcha|captcha/i.test(
                `${el.name || ""} ${el.id || ""}`
              )
            )
            .map((el) => ({
              id: el.id || "",
              name: el.name || "",
              hasValue: Boolean(el.value),
              valueLength:
                el.value
                  ? el.value.length
                  : 0,
            }));

          return {
            href: location.href,
            title: document.title,

            grecaptchaPresent:
              typeof window.grecaptcha !== "undefined",

            enterprisePresent:
              typeof window.grecaptcha !== "undefined" &&
              typeof window.grecaptcha.enterprise !==
                "undefined",

            scriptSrcs: scripts,

            siteKeyElements,

            captchaTextareas: textareas,
          };
        });

        const liveViewUrl =
          await liveView(page);

        // Dejamos la sesión activa
        browser.disconnect();

        return json({
          ok: true,

          sessionId,

          captcha,

          liveViewUrl,
        });

      } catch (error) {

        try {
          if (browser) {
            browser.disconnect();
          }
        } catch (_) {}

        return json(
          {
            ok: false,
            paso: "captcha-info",
            error: String(
              error?.stack || error
            ),
          },
          500
        );
      }
    }

    // ---------------------------------------------------------
    // LISTAR SESIONES ACTIVAS
    // ---------------------------------------------------------
    if (url.pathname === "/sessions") {

      try {

        const sessions =
          await puppeteer.sessions(
            env.BROWSER
          );

        return json({
          ok: true,
          sesiones: sessions,
        });

      } catch (error) {

        return json(
          {
            ok: false,
            paso: "sessions",
            error: String(
              error?.stack || error
            ),
          },
          500
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Ruta no encontrada",
        rutas: [
          "/browser-test",
          "/captcha-info",
          "/sessions"
        ],
      },
      404
    );
  },
};
