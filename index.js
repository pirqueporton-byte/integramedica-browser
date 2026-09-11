import puppeteer from "@cloudflare/puppeteer";

const AGENDA_URL =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
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
        rutas: ["/browser-test", "/sessions"],
      });
    }

    // PRUEBA 1:
    // abre una sesión real de Browser Run, navega a la agenda,
    // crea un Live View temporal y deja la sesión viva.
    if (url.pathname === "/browser-test") {
      let browser;

      try {
        browser = await puppeteer.launch(env.BROWSER, {
          keep_alive: 600000, // 10 minutos de inactividad
        });

        const sessionId = browser.sessionId();
        const page = await browser.newPage();

        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/153.0.0.0 Safari/537.36"
        );

        await page.goto(AGENDA_URL, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });

        const title = await page.title();
        const currentUrl = page.url();

        // Live View: permite que el usuario vea e interactúe
        // con ESTA MISMA sesión si hace falta intervención humana.
        const cdp = await page.createCDPSession();
        const liveView = await cdp.send("Cloudflare.getLiveView", {
          expiresInMs: 300000, // enlace válido por 5 minutos
        });

        // IMPORTANTE: no cerramos el navegador.
        // Disconnect libera la conexión del Worker pero conserva la sesión.
        browser.disconnect();

        return json({
          ok: true,
          estado: "browser_abierto",
          sessionId,
          title,
          currentUrl,
          liveViewUrl: liveView.devtoolsFrontendUrl,
          mensaje:
            "Sesión abierta. Usa liveViewUrl para entrar a la sesión interactiva.",
        });
      } catch (error) {
        try {
          if (browser) browser.disconnect();
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

    // Permite verificar qué sesiones Browser Run siguen abiertas.
    if (url.pathname === "/sessions") {
      try {
        const sessions = await puppeteer.sessions(env.BROWSER);
        return json({
          ok: true,
          sesiones: sessions,
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

    return json(
      {
        ok: false,
        error: "Ruta no encontrada",
        rutas: ["/browser-test", "/sessions"],
      },
      404
    );
  },
};
