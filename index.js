// @ts-nocheck
import puppeteer from "@cloudflare/puppeteer";
import { prepareRoute } from "./preparar-reserva.js";

const API = "https://api.bupa.cl";

const AGENDA =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica";

const KEEP_ALIVE = 60000;


// ========================================================
// JSON
// ========================================================

function j(data, status = 200) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {

        "content-type":
          "application/json; charset=UTF-8",

        "access-control-allow-origin":
          "*",

        "access-control-allow-methods":
          "GET,POST,OPTIONS",

        "access-control-allow-headers":
          "content-type",

        "cache-control":
          "no-store"
      }
    }
  );
}


const sleep =
  ms =>
    new Promise(
      r =>
        setTimeout(
          r,
          ms
        )
    );


// ========================================================
// RUT
// ========================================================

function rutLimpio(
  rut = ""
) {

  const x =
    String(rut)

      .replace(
        /\./g,
        ""
      )

      .replace(
        /-/g,
        ""
      )

      .replace(
        /\s/g,
        ""
      )

      .toUpperCase();


  return x.length > 1

    ?

    `${x.slice(0, -1)}-${x.slice(-1)}`

    :

    "";
}


// ========================================================
// PREVISIONES
// ========================================================

function prevNombre(
  codigo
) {

  return ({

    "900001":
      "Fonasa",

    "900003":
      "Isapre Cruz Blanca",

    "900004":
      "Isapre Banmédica",

    "900006":
      "Isapre Consalud",

    "900008":
      "Isapre Nueva Masvida",

    "900012":
      "Isapre Vida Tres",

    "900013":
      "Isapre Colmena",

    "900017":
      "Isapre Cruz del Norte",

    "9000052531":
      "Isapre Esencial",

    "900002":
      "Fundación Banco Estado",

    "900283":
      "Isalud Isapre CODELCO"

  })[
    String(
      codigo ||
      ""
    )
  ]

  ||

  String(
    codigo ||
    ""
  );
}


// ========================================================
// FECHA PARA DATOSCORREO
// ========================================================

function fechaDos(
  fecha
) {

  const [
    y,
    m,
    d
  ] =
    String(fecha)
      .split("-")
      .map(Number);


  const dt =
    new Date(
      Date.UTC(
        y,
        m - 1,
        d
      )
    );


  const dias = [

    "domingo",

    "lunes",

    "martes",

    "miércoles",

    "jueves",

    "viernes",

    "sábado"
  ];


  const meses = [

    "ene",

    "feb",

    "mar",

    "abr",

    "may",

    "jun",

    "jul",

    "ago",

    "sep",

    "oct",

    "nov",

    "dic"
  ];


  return {

    diaSeman:
      dias[
        dt.getUTCDay()
      ],

    mes:
      meses[
        m - 1
      ],

    anio:
      String(y),

    dia:
      String(d)
  };
}


// ========================================================
// BUSCAR DATOS EN RESPUESTA PACIENTE
// ========================================================

function findValue(
  obj,
  keys
) {

  const wanted =
    keys.map(
      k =>
        k.toLowerCase()
    );


  const seen =
    new Set();


  function walk(v) {

    if (
      !v

      ||

      typeof v !==
        "object"

      ||

      seen.has(v)
    ) {

      return "";
    }


    seen.add(v);


    for (
      const [
        k,
        x
      ]
      of Object.entries(v)
    ) {

      if (

        wanted.includes(
          k.toLowerCase()
        )

        &&

        [
          "string",
          "number"
        ]
          .includes(
            typeof x
          )

        &&

        String(x)
          .trim()
      ) {

        return String(x)
          .trim();
      }
    }


    for (
      const x
      of Object.values(v)
    ) {

      if (
        x

        &&

        typeof x ===
          "object"
      ) {

        const r =
          walk(x);


        if (r) {
          return r;
        }
      }
    }


    return "";
  }


  return walk(obj);
}


// ========================================================
// TOKEN PÚBLICO BUPA
// ========================================================

async function login() {

  const r =
    await fetch(
      `${API}/api/login`,
      {
        headers: {

          accept:
            "application/json"
        }
      }
    );


  if (!r.ok) {

    throw new Error(
      `Login Bupa HTTP ${r.status}`
    );
  }


  const x =
    await r.json();


  if (
    !x?.token
  ) {

    throw new Error(
      "Bupa no devolvió token público"
    );
  }


  return x.token;
}


// ========================================================
// DATOS PACIENTE
// ========================================================

async function pacienteApi(
  rut,
  token
) {

  try {

    const r =
      await fetch(
        `${API}/agenda/ms-sap/usuario/consultapaciente`,
        {

          method:
            "POST",

          headers: {

            accept:
              "application/json",

            "content-type":
              "application/json",

            authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify(
              {

                ConsultaPacienteReq: {

                  rut
                }
              }
            )
        }
      );


    return r.ok

      ?

      await r.json()

      :

      {};

  } catch {

    return {};
  }
}


// ========================================================
// CONSTRUIR PAYLOAD FINAL
// ========================================================

function buildPayload(
  entrada,
  datosPaciente,
  captcha
) {

  const p =
    entrada.paciente ||
    {};


  const r =
    entrada.reserva ||
    {};


  const rut =
    rutLimpio(
      p.rut
    );


  const prevision =
    String(

      p.previsionCodigo

      ||

      p.prevision

      ||

      r.prevision

      ||

      "900003"
    );


  const profesional =
    String(

      r.rutProfesional

      ||

      r.profesionalRut

      ||

      ""
    );


  const centro =
    String(

      r.centroCodigo

      ||

      r.centro

      ||

      ""
    );


  const fecha =
    String(
      r.fecha ||
      ""
    );


  const hora =
    String(

      r.hora

      ||

      r.HoraInicio

      ||

      ""
    );


  const tipoPlan =
    String(

      r.tipoPlanificacion

      ||

      r.disponibilidad

      ||

      ""
    );


  const pobNr =
    String(

      r.pobNr

      ||

      r.PobNr

      ||

      ""
    );


  if (

    !rut

    ||

    !profesional

    ||

    !centro

    ||

    !fecha

    ||

    !hora

    ||

    !tipoPlan

    ||

    !pobNr

  ) {

    throw new Error(
      "Faltan datos obligatorios de la reserva"
    );
  }


  const esp =
    String(

      r.especialidadCodigo

      ||

      r.especialidad

      ||

      "2690"
    );


  const espNombre =
    r.especialidadNombre

    ||

    "Medicina General (mayor a 15 años)";


  /*
   * IMPORTANTE:
   *
   * El request REAL que capturaste
   * usa Prestacion = 10T202.
   *
   * 11814A se utilizó en disponibilidad,
   * no como Prestacion del POST final.
   */

  const prestacion =
    String(

      r.prestacion

      ||

      r.categoriaPrestacion

      ||

      "10T202"
    );


  const nombre =
    p.nombre

    ||

    findValue(
      datosPaciente,
      [
        "NombreCompleto",
        "NombrePaciente",
        "Nombre"
      ]
    );


  const correo =
    p.correo

    ||

    findValue(
      datosPaciente,
      [
        "Correo",
        "Email",
        "Mail"
      ]
    );


  const telefono =
    p.telefono

    ||

    findValue(
      datosPaciente,
      [
        "Telefono",
        "Teléfono",
        "Celular",
        "Movil",
        "Móvil"
      ]
    );


  return {

    captcha,


    data: {

      BupaCitaRequest: {


        Canal:
          "W",


        CentroMedico:
          centro,


        CentroSanitario:
          "RED",


        Clasificacion:
          "01",


        Consentimiento: {

          Business:
            "",

          Versions:
            [],

          AppointmentType:
            ""
        },


        Correo:
          correo ||
          "",


        DatosCorreo: {


          IdReserva:
            "",


          Indicacion:

            r.indicacion

            ||

            "IMPORTANTE, la reserva de hora es para pacientes mayores de 15 años.",


          DatosPaciente: {


            Rut:
              rut,


            Nombre:
              nombre ||
              "",


            Prevision:

              p.previsionNombre

              ||

              prevNombre(
                prevision
              ),


            Correo:
              correo ||
              ""
          },


          DatosProfesional: {


            Nombre:

              r.profesionalNombre

              ||

              r.profesional

              ||

              "",


            Especialidad:
              espNombre,


            Prestacion:

              r.prestacionNombre

              ||

              espNombre
          },


          DatosReserva: {


            Fecha:
              fecha,


            FechaDos:
              fechaDos(
                fecha
              ),


            CentroMedico:

              r.centroNombre

              ||

              centro,


            Coordenadas:

              r.coordenadas

              ||

              "",


            Direccion:

              r.direccion

              ||

              ""
          },


          Especialidad:
            esp,


          Origen:
            "integramedica",


          PhygitalActive:
            true,


          Prestacion:
            prestacion,


          activarMensajeSieteDias:
            false
        },


        Duracion:

          String(
            r.duracion ||
            "0015"
          ),


        Especialidad:
          esp,


        FechaCita:
          fecha,


        HoraCita:
          hora,


        IdCita:
          "",


        IdWeb:
          "agenda-web-v3",


        NuevaFecha:
          "",


        NuevaHora:
          "",


        NuevoPaciente:
          "",


        Operacion:
          "INS",


        Prestacion:
          prestacion,


        Prevision:
          prevision,


        RutProfesional:
          profesional,


        RutUsuario:
          rut,


        Telefono:
          telefono ||
          "",


        TipoPlanificacion:
          tipoPlan,


        Url:

          r.urlConfirmacion

          ||

          "https://agenda.bupa.cl/integramedica/agenda-consulta-medica/reserva-confirmar-hora",


        acronimoPadre:
          "CD",


        busquedaPor:

          Number.isFinite(
            Number(
              r.busquedaPor
            )
          )

            ?

            Number(
              r.busquedaPor
            )

            :

            4,


        captureConsentAcceptance:
          "",


        idCita:
          "",


        isContingencia:
          "true",


        pobNr
      }
    },


    isUserLogged:
      false,


    kibanaCov19: {

      business:
        "integramedica",

      clasificacion:
        "01",

      valueScore:
        ""
    },


    valueScore:
      ""
  };
}


// ========================================================
// LIVE VIEW
// ========================================================

async function liveView(
  page
) {

  const cdp =
    await page
      .createCDPSession();


  const {
    devtoolsFrontendUrl
  } =
    await cdp.send(
      "Cloudflare.getLiveView",
      {

        mode:
          "tab",

        expiresInMs:
          300000
      }
    );


  return devtoolsFrontendUrl;
}


// ========================================================
// OBTENER PÁGINA
// ========================================================

async function agendaPage(
  browser
) {

  const pages =
    await browser.pages();


  return (

    pages.find(
      p =>
        p.url()
          .includes(
            "agenda.bupa.cl"
          )
    )

    ||

    pages[
      pages.length - 1
    ]

    ||

    await browser
      .newPage()
  );
}


// ========================================================
// DESCUBRIR RECAPTCHA
// ========================================================

async function captchaInfo(
  page
) {

  return await page.evaluate(
    async () => {


      const valid =
        x =>

          typeof x ===
            "string"

          &&

          /^6L[A-Za-z0-9_-]{20,}$/
            .test(x);


      let siteKey =
        "";


      let action =
        "";


      // --------------------------------------------
      // data-sitekey
      // --------------------------------------------

      const el =
        document
          .querySelector(
            "[data-sitekey]"
          );


      if (el) {

        siteKey =
          el.getAttribute(
            "data-sitekey"
          )

          ||

          "";
      }


      // --------------------------------------------
      // Script ?render=SITEKEY
      // --------------------------------------------

      if (!siteKey) {

        for (
          const s
          of Array.from(
            document.scripts
          )
        ) {

          const src =
            s.src ||
            "";


          if (
            !/recaptcha/i
              .test(src)
          ) {

            continue;
          }


          try {

            const render =
              new URL(
                src,
                location.href
              )
              .searchParams
              .get(
                "render"
              );


            if (

              render

              &&

              render !==
                "explicit"

              &&

              valid(render)

            ) {

              siteKey =
                render;

              break;
            }

          } catch {}
        }
      }


      // --------------------------------------------
      // Config interna grecaptcha
      // --------------------------------------------

      if (

        !siteKey

        &&

        window
          .___grecaptcha_cfg
          ?.clients

      ) {

        const seen =
          new Set();


        function walk(
          o,
          depth = 0
        ) {

          if (

            !o

            ||

            typeof o !==
              "object"

            ||

            depth > 8

            ||

            seen.has(o)

          ) {

            return "";
          }


          seen.add(o);


          for (
            const [
              k,
              v
            ]
            of Object.entries(o)
          ) {

            if (

              typeof v ===
                "string"

              &&

              valid(v)

              &&

              (
                /sitekey/i
                  .test(k)

                ||

                valid(v)
              )

            ) {

              return v;
            }
          }


          for (
            const v
            of Object.values(o)
          ) {

            if (

              v

              &&

              typeof v ===
                "object"

            ) {

              const r =
                walk(
                  v,
                  depth + 1
                );


              if (r) {
                return r;
              }
            }
          }


          return "";
        }


        siteKey =
          walk(
            window
              .___grecaptcha_cfg
              .clients
          );
      }


      // --------------------------------------------
      // Buscar action usada por el frontend
      // --------------------------------------------

      const sameOriginScripts =
        Array.from(
          document.scripts
        )

        .map(
          s =>
            s.src
        )

        .filter(Boolean)

        .filter(
          src => {

            try {

              return (
                new URL(
                  src,
                  location.href
                )
                .origin

                ===

                location.origin
              );

            } catch {

              return false;
            }
          }
        )

        .slice(
          0,
          20
        );


      for (
        const src
        of sameOriginScripts
      ) {

        try {

          const txt =
            await fetch(src)
              .then(
                r =>
                  r.text()
              );


          if (
            !/grecaptcha|recaptcha/i
              .test(txt)
          ) {

            continue;
          }


          const m =

            txt.match(
              /grecaptcha(?:\.enterprise)?\.execute\([^)]{0,500}?action\s*:\s*["'`]([^"'`]+)["'`]/i
            )

            ||

            txt.match(
              /recaptcha[^]{0,500}?action\s*:\s*["'`]([^"'`]+)["'`]/i
            );


          if (
            m?.[1]
          ) {

            action =
              m[1];

            break;
          }

        } catch {}
      }


      return {

        siteKey,

        action,

        loaded:

          typeof window
            .grecaptcha

          !==

          "undefined"
      };

    }
  );
}


// ========================================================
// INICIAR CAPTCHA LEGÍTIMO
// ========================================================

async function startCaptcha(
  page
) {

  for (
    let i = 0;
    i < 20;
    i++
  ) {

    if (
      await page.evaluate(
        () =>

          typeof window
            .grecaptcha

          !==

          "undefined"
      )
    ) {

      break;
    }


    await sleep(
      250
    );
  }


  const info =
    await captchaInfo(
      page
    );


  if (
    !info.loaded
  ) {

    return {

      ok:
        false,

      estado:
        "recaptcha_no_cargado",

      info
    };
  }


  if (
    !info.siteKey
  ) {

    return {

      ok:
        false,

      estado:
        "sitekey_no_encontrada",

      info
    };
  }


  const action =
    info.action

    ||

    "reservahora";


  const start =
    await page.evaluate(

      ({
        siteKey,
        action
      }) => {


        window
          .__BUPA_CAPTCHA_TOKEN__ =
            "";


        window
          .__BUPA_CAPTCHA_ERROR__ =
            "";


        const gre =

          window
            .grecaptcha
            ?.enterprise

          ||

          window
            .grecaptcha;


        const save =
          t => {

            if (t) {

              window
                .__BUPA_CAPTCHA_TOKEN__ =
                  t;
            }
          };


        // ----------------------------------------
        // v3 / enterprise
        // ----------------------------------------

        try {

          const x =
            gre.execute(
              siteKey,
              {
                action
              }
            );


          if (

            x

            &&

            typeof x.then ===
              "function"

          ) {

            x.then(
              save
            )
            .catch(
              e =>

                window
                  .__BUPA_CAPTCHA_ERROR__ =
                    String(e)
            );


            return {

              modo:
                "execute-sitekey"
            };
          }


          if (

            typeof x ===
              "string"

            &&

            x

          ) {

            save(x);


            return {

              modo:
                "execute-sitekey"
            };
          }

        } catch (e) {

          window
            .__BUPA_CAPTCHA_ERROR__ =
              String(e);
        }


        // ----------------------------------------
        // Invisible v2
        // ----------------------------------------

        try {

          let c =
            document
              .getElementById(
                "__bupa_recaptcha__"
              );


          if (!c) {

            c =
              document
                .createElement(
                  "div"
                );


            c.id =
              "__bupa_recaptcha__";


            c.style.cssText =
              "position:fixed;left:8px;bottom:8px;z-index:2147483647";


            document
              .body
              .appendChild(c);
          }


          const wid =
            gre.render(
              c,
              {

                sitekey:
                  siteKey,

                size:
                  "invisible",

                callback:
                  save,

                "expired-callback":
                  () =>

                    window
                      .__BUPA_CAPTCHA_TOKEN__ =
                        "",

                "error-callback":
                  () =>

                    window
                      .__BUPA_CAPTCHA_ERROR__ =
                        "reCAPTCHA informó error"
              }
            );


          window
            .__BUPA_CAPTCHA_WIDGET__ =
              wid;


          gre.execute(
            wid
          );


          return {

            modo:
              "invisible-v2"
          };

        } catch (e) {

          window
            .__BUPA_CAPTCHA_ERROR__ =
              String(e);


          return {

            modo:
              "",

            error:
              String(e)
          };
        }

      },

      {
        siteKey:
          info.siteKey,

        action
      }
    );


  // ----------------------------------------------
  // Esperar token unos segundos
  // ----------------------------------------------

  for (
    let i = 0;
    i < 24;
    i++
  ) {

    const token =
      await page.evaluate(
        () =>

          window
            .__BUPA_CAPTCHA_TOKEN__

          ||

          ""
      );


    if (token) {

      return {

        ok:
          true,

        estado:
          "captcha_listo",

        token,

        info: {

          ...info,

          action,

          modo:
            start.modo
        }
      };
    }


    await sleep(
      250
    );
  }


  // ----------------------------------------------
  // ¿Google abrió desafío visual?
  // ----------------------------------------------

  const visual =
    await page.evaluate(
      () =>

        Array.from(
          document
            .querySelectorAll(
              "iframe"
            )
        )
        .some(
          f => {

            if (
              !/recaptcha|captcha/i
                .test(
                  f.src ||
                  ""
                )
            ) {

              return false;
            }


            const r =
              f.getBoundingClientRect();


            return (

              r.width > 100

              &&

              r.height > 100
            );
          }
        )
    );


  return {

    ok:
      false,

    estado:

      visual

        ?

        "requiere_verificacion"

        :

        "captcha_sin_token",

    info: {

      ...info,

      action,

      modo:
        start.modo,

      error:
        start.error ||
        ""
    }
  };
}


// ========================================================
// ENVIAR RESERVA
// ========================================================

async function sendBooking(
  entrada,
  captcha
) {

  const token =
    await login();


  const rut =
    rutLimpio(
      entrada
        ?.paciente
        ?.rut
    );


  const datosPaciente =
    await pacienteApi(
      rut,
      token
    );


  const payload =
    buildPayload(
      entrada,
      datosPaciente,
      captcha
    );


  const r =
    await fetch(
      `${API}/agenda/ms-sap/reserva/reservahora`,
      {

        method:
          "POST",

        headers: {

          accept:
            "application/json",

          "content-type":
            "application/json",

          authorization:
            `Bearer ${token}`,

          origin:
            "https://agenda.bupa.cl",

          referer:
            "https://agenda.bupa.cl/"
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );


  const raw =
    await r.text();


  let data;


  try {

    data =
      JSON.parse(
        raw
      );

  } catch {

    data = {
      raw
    };
  }


  const idCita =

    data
      ?.data
      ?.IdCita

    ||

    data
      ?.IdCita

    ||

    data
      ?.data
      ?.idCita

    ||

    "";


  const tipo =

    data
      ?.data
      ?.Estatus
      ?.Tipo

    ||

    data
      ?.Estatus
      ?.Tipo

    ||

    "";


  return {

    ok:

      r.ok

      &&

      (
        !!idCita

        ||

        tipo ===
          "S"
      ),


    status:
      r.status,


    idCita,


    data
  };
}


// ========================================================
// WORKER
// ========================================================

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );


    // ====================================================
    // CORS
    // ====================================================

    if (
      request.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {

          headers: {

            "access-control-allow-origin":
              "*",

            "access-control-allow-methods":
              "GET,POST,OPTIONS",

            "access-control-allow-headers":
              "content-type"
          }
        }
      );
    }


    if (url.pathname === "/preparar-reserva" && request.method === "POST") {
      return prepareRoute(request, env, puppeteer, j);
    }

    // ====================================================
    // HOME
    // ====================================================

    if (
      url.pathname ===
      "/"
    ) {

      return j(
        {

          ok:
            true,

          servicio:
            "IntegraMedica Browser API-first",

          rutas: [

            "/sessions",

            "POST /validar-payload",

            "POST /flujo-completo",

            "POST /continuar-verificacion",

            "/cerrar?sessionId=..."
          ]
        }
      );
    }


    // ====================================================
    // SESIONES
    // ====================================================

    if (
      url.pathname ===
      "/sessions"
    ) {

      try {

        return j(
          {

            ok:
              true,

            sesiones:

              await puppeteer
                .sessions(
                  env.BROWSER
                )
          }
        );

      } catch (e) {

        return j(
          {

            ok:
              false,

            error:
              String(
                e?.stack ||
                e
              )
          },

          500
        );
      }
    }


    // ====================================================
    // VALIDAR PAYLOAD
    //
    // NO ABRE BROWSER RUN
    // ====================================================

    if (

      url.pathname ===
        "/validar-payload"

      &&

      request.method ===
        "POST"

    ) {

      try {

        const entrada =
          await request.json();


        const token =
          await login();


        const rut =
          rutLimpio(
            entrada
              ?.paciente
              ?.rut
          );


        if (!rut) {

          return j(
            {

              ok:
                false,

              estado:
                "datos_incompletos",

              faltante:
                "paciente.rut"
            },

            400
          );
        }


        const datosPaciente =
          await pacienteApi(
            rut,
            token
          );


        const p =
          buildPayload(
            entrada,
            datosPaciente,
            "__VALIDACION__"
          )
          .data
          .BupaCitaRequest;


        return j(
          {

            ok:
              true,

            estado:
              "payload_valido",

            reserva: {


              CentroMedico:
                p.CentroMedico,


              Especialidad:
                p.Especialidad,


              FechaCita:
                p.FechaCita,


              HoraCita:
                p.HoraCita,


              Prestacion:
                p.Prestacion,


              Prevision:
                p.Prevision,


              RutProfesional:
                p.RutProfesional,


              TipoPlanificacion:
                p.TipoPlanificacion,


              Duracion:
                p.Duracion,


              pobNr:
                p.pobNr,


              busquedaPor:
                p.busquedaPor
            }
          }
        );

      } catch (e) {

        return j(
          {

            ok:
              false,

            estado:
              "payload_invalido",

            error:
              String(
                e?.stack ||
                e
              )
          },

          400
        );
      }
    }


    // ====================================================
    // FLUJO COMPLETO
    // ====================================================

    if (

      url.pathname ===
        "/flujo-completo"

      &&

      request.method ===
        "POST"

    ) {

      let browser =
        null;


      let mantener =
        false;


      try {

        const entrada =
          await request.json();


        if (
          entrada.confirmar !==
          true
        ) {

          return j(
            {

              ok:
                false,

              estado:
                "requiere_confirmacion"
            },

            400
          );
        }


        // ----------------------------------------------
        // VALIDAR TODO ANTES DE ABRIR BROWSER RUN
        // ----------------------------------------------

        const token =
          await login();


        const rut =
          rutLimpio(
            entrada
              ?.paciente
              ?.rut
          );


        if (!rut) {

          return j(
            {

              ok:
                false,

              estado:
                "datos_incompletos",

              faltante:
                "paciente.rut"
            },

            400
          );
        }


        const datosPaciente =
          await pacienteApi(
            rut,
            token
          );


        buildPayload(
          entrada,
          datosPaciente,
          "__VALIDACION__"
        );


        // ----------------------------------------------
        // BROWSER RUN SOLO DESDE AQUÍ
        // ----------------------------------------------

        browser =
          await puppeteer.launch(
            env.BROWSER,
            {

              keep_alive:
                KEEP_ALIVE
            }
          );


        const sessionId =
          browser.sessionId();


        const page =
          await browser
            .newPage();


        page
          .setDefaultTimeout(
            10000
          );


        page
          .setDefaultNavigationTimeout(
            20000
          );


        await page.goto(
          AGENDA,
          {

            waitUntil:
              "domcontentloaded",

            timeout:
              20000
          }
        );


        await sleep(
          1200
        );


        // ----------------------------------------------
        // CAPTCHA LEGÍTIMO
        // ----------------------------------------------

        const cap =
          await startCaptcha(
            page
          );


        // ----------------------------------------------
        // TENEMOS TOKEN
        // ----------------------------------------------

        if (
          cap.ok
        ) {

          const res =
            await sendBooking(
              entrada,
              cap.token
            );


          await browser.close();


          browser =
            null;


          if (
            res.ok
          ) {

            return j(
              {

                ok:
                  true,

                estado:
                  "reservada",

                idCita:
                  res.idCita ||
                  null,

                respuestaBupa:
                  res.data
              }
            );
          }


          return j(
            {

              ok:
                false,

              estado:
                "respuesta_reserva_error",

              httpStatus:
                res.status,

              respuestaBupa:
                res.data,

              captchaInfo:
                cap.info
            },

            400
          );
        }


        // ----------------------------------------------
        // CAPTCHA HUMANO / DIAGNÓSTICO
        // ----------------------------------------------

        const lv =
          await liveView(
            page
          );


        mantener =
          true;


        browser
          .disconnect();


        browser =
          null;


        return j(
          {

            ok:
              false,

            estado:

              cap.estado ===
                "requiere_verificacion"

              ||

              cap.estado ===
                "captcha_sin_token"

                ?

                "requiere_verificacion"

                :

                "requiere_intervencion",


            sessionId,


            liveViewUrl:
              lv,


            motivo:
              cap.estado,


            captchaInfo:
              cap.info
          }
        );

      } catch (e) {

        if (
          browser

          &&

          !mantener
        ) {

          try {

            await browser.close();

          } catch {}
        }


        return j(
          {

            ok:
              false,

            estado:
              "error_flujo",

            error:
              String(
                e?.stack ||
                e
              )
          },

          500
        );
      }
    }


    // ====================================================
    // CONTINUAR CAPTCHA HUMANO
    // ====================================================

    if (

      url.pathname ===
        "/continuar-verificacion"

      &&

      request.method ===
        "POST"

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

          return j(
            {

              ok:
                false,

              estado:
                "requiere_confirmacion"
            },

            400
          );
        }


        if (
          !entrada.sessionId
        ) {

          return j(
            {

              ok:
                false,

              estado:
                "datos_incompletos",

              faltante:
                "sessionId"
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
          await agendaPage(
            browser
          );


        await sleep(
          500
        );


        let token =
          await page.evaluate(
            () =>

              window
                .__BUPA_CAPTCHA_TOKEN__

              ||

              ""
          );


        if (!token) {

          await sleep(
            1000
          );


          token =
            await page.evaluate(
              () =>

                window
                  .__BUPA_CAPTCHA_TOKEN__

                ||

                ""
            );
        }


        // ----------------------------------------------
        // TODAVÍA NO TERMINA CAPTCHA
        // ----------------------------------------------

        if (!token) {

          const lv =
            await liveView(
              page
            );


          browser
            .disconnect();


          browser =
            null;


          return j(
            {

              ok:
                false,

              estado:
                "requiere_verificacion",

              sessionId:
                entrada.sessionId,

              liveViewUrl:
                lv
            }
          );
        }


        // ----------------------------------------------
        // CAPTCHA RESUELTO
        // ----------------------------------------------

        const res =
          await sendBooking(
            entrada,
            token
          );


        await browser.close();


        browser =
          null;


        if (
          res.ok
        ) {

          return j(
            {

              ok:
                true,

              estado:
                "reservada",

              idCita:
                res.idCita ||
                null,

              respuestaBupa:
                res.data
            }
          );
        }


        return j(
          {

            ok:
              false,

            estado:
              "respuesta_reserva_error",

            httpStatus:
              res.status,

            respuestaBupa:
              res.data
          },

          400
        );

      } catch (e) {

        try {

          if (browser) {

            await browser.close();
          }

        } catch {}


        return j(
          {

            ok:
              false,

            estado:
              "error_continuar",

            error:
              String(
                e?.stack ||
                e
              )
          },

          500
        );
      }
    }


    // ====================================================
    // CERRAR SESIÓN
    // ====================================================

    if (
      url.pathname ===
      "/cerrar"
    ) {

      const id =
        url
          .searchParams
          .get(
            "sessionId"
          );


      if (!id) {

        return j(
          {

            ok:
              false,

            error:
              "Falta sessionId"
          },

          400
        );
      }


      try {

        const b =
          await puppeteer.connect(
            env.BROWSER,
            id
          );


        await b.close();


        return j(
          {

            ok:
              true,

            estado:
              "sesion_cerrada"
          }
        );

      } catch {

        return j(
          {

            ok:
              false,

            estado:
              "sesion_no_disponible"
          },

          404
        );
      }
    }


    return j(
      {

        ok:
          false,

        error:
          "Ruta no encontrada"
      },

      404
    );
  }
};
