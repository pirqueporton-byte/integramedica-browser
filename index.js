// @ts-nocheck

import puppeteer from "@cloudflare/puppeteer";

const AGENDA_URL =
  "https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica";

const RESERVA_ENDPOINT =
  "/agenda/ms-sap/reserva/reservahora";

const KEEP_ALIVE_MS = 60000;


// ========================================================
// RESPUESTA JSON
// ========================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
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


// ========================================================
// PAUSA
// ========================================================

function pausa(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


// ========================================================
// LIVE VIEW
// ========================================================

async function liveView(page) {

  const cdp =
    await page.createCDPSession();

  const {
    devtoolsFrontendUrl
  } =
    await cdp.send(
      "Cloudflare.getLiveView",
      {
        mode: "tab",

        expiresInMs:
          300000
      }
    );

  return devtoolsFrontendUrl;
}


// ========================================================
// OBTENER PÁGINA DE AGENDA
// ========================================================

async function obtenerPagina(
  browser
) {

  const pages =
    await browser.pages();

  if (!pages.length) {
    return await browser.newPage();
  }

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
  );
}


// ========================================================
// CLICK POR TEXTO
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
    opciones.exacto ??
    false;


  const resultado =
    await page.evaluate(

      ({
        textos,
        exacto
      }) => {

        function norm(
          texto = ""
        ) {

          return String(texto)
            .normalize("NFD")
            .replace(
              /[\u0300-\u036f]/g,
              ""
            )
            .toLowerCase()
            .replace(
              /\s+/g,
              " "
            )
            .trim();
        }


        function visible(el) {

          if (!el) {
            return false;
          }

          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);

          return (
            rect.width > 0
            &&
            rect.height > 0
            &&
            style.display !==
              "none"
            &&
            style.visibility !==
              "hidden"
            &&
            style.opacity !==
              "0"
          );
        }


        function textoElemento(
          el
        ) {

          return norm(

            el.innerText

            ||

            el.textContent

            ||

            el.getAttribute(
              "aria-label"
            )

            ||

            el.getAttribute(
              "title"
            )

            ||

            el.getAttribute(
              "placeholder"
            )

            ||

            el.value

            ||

            ""
          );
        }


        const selectorInteractivo =
          [
            "button",

            "a",

            "[role='button']",

            "[role='option']",

            "[role='combobox']",

            "[aria-haspopup='listbox']",

            "li",

            "mat-option",

            ".mat-option",

            ".mat-mdc-option",

            ".ng-option",

            "mat-select",

            ".mat-select-trigger",

            ".mat-mdc-select-trigger",

            ".ng-select-container",

            "[tabindex]"
          ].join(",");


        const buscados =
          textos
            .map(norm)
            .filter(Boolean);


        const interactivos =
          Array.from(
            document
              .querySelectorAll(
                selectorInteractivo
              )
          )
          .filter(visible);


        const fallback =
          Array.from(
            document
              .querySelectorAll(
                "label, span, div, p"
              )
          )
          .filter(visible);


        const candidatos =
          [
            ...interactivos,
            ...fallback
          ];


        for (
          const buscado
          of buscados
        ) {

          const coincidencias =
            candidatos
              .filter(
                el => {

                  const texto =
                    textoElemento(
                      el
                    );

                  if (!texto) {
                    return false;
                  }

                  if (exacto) {
                    return (
                      texto ===
                      buscado
                    );
                  }

                  return (
                    texto ===
                      buscado

                    ||

                    texto.includes(
                      buscado
                    )
                  );
                }
              );


          coincidencias.sort(
            (a, b) => {

              const textoA =
                textoElemento(a);

              const textoB =
                textoElemento(b);


              const exactoA =
                textoA ===
                buscado
                  ? 0
                  : 1;

              const exactoB =
                textoB ===
                buscado
                  ? 0
                  : 1;


              if (
                exactoA !==
                exactoB
              ) {

                return (
                  exactoA -
                  exactoB
                );
              }


              const interactivoA =
                a.matches(
                  selectorInteractivo
                )
                  ? 0
                  : 1;

              const interactivoB =
                b.matches(
                  selectorInteractivo
                )
                  ? 0
                  : 1;


              if (
                interactivoA !==
                interactivoB
              ) {

                return (
                  interactivoA -
                  interactivoB
                );
              }


              if (
                textoA.length !==
                textoB.length
              ) {

                return (
                  textoA.length -
                  textoB.length
                );
              }


              const rectA =
                a.getBoundingClientRect();

              const rectB =
                b.getBoundingClientRect();


              return (
                (
                  rectA.width *
                  rectA.height
                )

                -

                (
                  rectB.width *
                  rectB.height
                )
              );
            }
          );


          if (
            !coincidencias.length
          ) {

            continue;
          }


          const base =
            coincidencias[0];


          const clickable =
            base.closest(
              selectorInteractivo
            )
            ||
            base;


          if (
            !visible(clickable)
          ) {

            continue;
          }


          clickable
            .scrollIntoView(
              {
                block:
                  "center",

                inline:
                  "center"
              }
            );


          clickable.click();


          return true;
        }


        return false;

      },

      {
        textos,
        exacto
      }
    );


  if (resultado) {

    await pausa(
      opciones.espera ??
      700
    );
  }


  return resultado;
}


// ========================================================
// LLENAR CAMPO
// ========================================================

async function llenarCampo(
  page,
  nombres,
  valor
) {

  if (
    !Array.isArray(
      nombres
    )
  ) {

    nombres = [
      nombres
    ];
  }


  const selector =
    await page.evaluate(

      nombres => {

        function norm(
          texto = ""
        ) {

          return String(texto)
            .normalize("NFD")
            .replace(
              /[\u0300-\u036f]/g,
              ""
            )
            .toLowerCase()
            .replace(
              /\s+/g,
              " "
            )
            .trim();
        }


        function visible(el) {

          if (!el) {
            return false;
          }

          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);

          return (
            rect.width > 0
            &&
            rect.height > 0
            &&
            style.display !==
              "none"
            &&
            style.visibility !==
              "hidden"
          );
        }


        const buscados =
          nombres.map(
            norm
          );


        const inputs =
          Array.from(
            document
              .querySelectorAll(
                "input, textarea"
              )
          )
          .filter(
            visible
          );


        for (
          let i = 0;
          i < inputs.length;
          i++
        ) {

          const input =
            inputs[i];


          const id =
            input.id ||
            "";


          const label =
            id

              ?

              document
                .querySelector(
                  `label[for="${CSS.escape(id)}"]`
                )

              :

              null;


          const wrapper =
            input.closest(
              [
                "mat-form-field",

                ".mat-mdc-form-field",

                ".form-group",

                ".field",

                "div",

                "form"
              ].join(",")
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
            buscados.some(
              buscado =>
                contexto.includes(
                  buscado
                )
            )
          ) {

            if (
              !input.id
            ) {

              input.id =
                `auto-field-${i}-${Date.now()}`;
            }


            return (
              "#"
              +
              CSS.escape(
                input.id
              )
            );
          }
        }


        return null;

      },

      nombres
    );


  if (!selector) {
    return false;
  }


  const input =
    await page.$(
      selector
    );


  if (!input) {
    return false;
  }


  /*
   * No usamos Control+A.
   *
   * Triple click selecciona
   * el contenido y Backspace
   * lo limpia.
   */

  await input.click(
    {
      clickCount:
        3
    }
  );


  await page
    .keyboard
    .press(
      "Backspace"
    );


  await input.type(
    String(valor),
    {
      delay:
        30
    }
  );


  /*
   * Angular puede depender
   * de los eventos input/change.
   */

  await page.evaluate(

    el => {

      el.dispatchEvent(
        new Event(
          "input",
          {
            bubbles:
              true
          }
        )
      );


      el.dispatchEvent(
        new Event(
          "change",
          {
            bubbles:
              true
          }
        )
      );

    },

    input
  );


  await pausa(
    500
  );


  return true;
}


// ========================================================
// SELECCIONAR OPCIÓN
// ========================================================

async function seleccionarOpcion(
  page,
  campo,
  valor
) {

  /*
   * Buscamos primero
   * el control REAL asociado
   * al texto del campo:
   *
   * Previsión
   * Especialidad
   * Centro
   */

  const selector =
    await page.evaluate(

      campo => {

        function norm(
          texto = ""
        ) {

          return String(texto)
            .normalize("NFD")
            .replace(
              /[\u0300-\u036f]/g,
              ""
            )
            .toLowerCase()
            .replace(
              /\s+/g,
              " "
            )
            .trim();
        }


        function visible(el) {

          if (!el) {
            return false;
          }

          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);


          return (
            rect.width > 0
            &&
            rect.height > 0
            &&
            style.display !==
              "none"
            &&
            style.visibility !==
              "hidden"
          );
        }


        const campoNormalizado =
          norm(campo);


        const controlSelector =
          [
            "select",

            "input",

            "[role='combobox']",

            "[aria-haspopup='listbox']",

            "mat-select",

            ".mat-select-trigger",

            ".mat-mdc-select-trigger",

            ".ng-select",

            ".ng-select-container"
          ].join(",");


        // ---------------------------------
        // 1. LABEL / TEXTO DEL CAMPO
        // ---------------------------------

        const marcadores =
          Array.from(
            document
              .querySelectorAll(
                "label, span, p, div"
              )
          )
          .filter(
            visible
          )
          .filter(
            el => {

              const texto =
                norm(
                  el.innerText
                  ||
                  el.textContent
                  ||
                  ""
                );


              return (

                texto ===
                  campoNormalizado

                ||

                (
                  texto.includes(
                    campoNormalizado
                  )

                  &&

                  texto.length <=
                    campoNormalizado.length
                    +
                    30
                )
              );
            }
          )
          .sort(
            (a, b) => {

              const textoA =
                norm(
                  a.innerText
                  ||
                  a.textContent
                  ||
                  ""
                );

              const textoB =
                norm(
                  b.innerText
                  ||
                  b.textContent
                  ||
                  ""
                );


              return (
                textoA.length -
                textoB.length
              );
            }
          );


        for (
          const marcador
          of marcadores
        ) {

          const forId =
            marcador
              .getAttribute?.(
                "for"
              );


          if (forId) {

            const asociado =
              document
                .getElementById(
                  forId
                );


            if (
              asociado
              &&
              visible(asociado)
            ) {

              if (
                !asociado.id
              ) {

                asociado.id =
                  `auto-select-${Date.now()}`;
              }


              return (
                "#"
                +
                CSS.escape(
                  asociado.id
                )
              );
            }
          }


          /*
           * Si no usa label-for,
           * subimos por el DOM
           * buscando combobox,
           * mat-select,
           * ng-select, etc.
           */

          let contenedor =
            marcador.parentElement;


          for (
            let nivel = 0;

            nivel < 5
            &&
            contenedor;

            nivel++
          ) {

            const control =
              contenedor
                .querySelector(
                  controlSelector
                );


            if (
              control
              &&
              visible(control)
            ) {

              if (
                !control.id
              ) {

                control.id =
                  `auto-select-${Date.now()}-${nivel}`;
              }


              return (
                "#"
                +
                CSS.escape(
                  control.id
                )
              );
            }


            contenedor =
              contenedor
                .parentElement;
          }
        }


        // ---------------------------------
        // 2. ATRIBUTOS DEL CONTROL
        // ---------------------------------

        const controles =
          Array.from(
            document
              .querySelectorAll(
                controlSelector
              )
          )
          .filter(
            visible
          );


        for (
          let i = 0;
          i < controles.length;
          i++
        ) {

          const control =
            controles[i];


          const id =
            control.id ||
            "";


          const label =
            id

              ?

              document
                .querySelector(
                  `label[for="${CSS.escape(id)}"]`
                )

              :

              null;


          const wrapper =
            control.closest(
              [
                "mat-form-field",

                ".mat-mdc-form-field",

                ".form-group",

                ".field",

                ".ng-select",

                ".input-group",

                "div"
              ].join(",")
            );


          const contexto =
            norm(
              [
                control.getAttribute(
                  "aria-label"
                ),

                control.getAttribute(
                  "placeholder"
                ),

                control.getAttribute(
                  "name"
                ),

                control.id,

                label?.innerText,

                wrapper?.innerText
              ]
              .filter(Boolean)
              .join(" ")
            );


          if (
            contexto.includes(
              campoNormalizado
            )
          ) {

            if (
              !control.id
            ) {

              control.id =
                `auto-select-${i}-${Date.now()}`;
            }


            return (
              "#"
              +
              CSS.escape(
                control.id
              )
            );
          }
        }


        return null;

      },

      campo
    );


  // =====================================================
  // SI ENCONTRAMOS CONTROL REAL
  // =====================================================

  if (selector) {

    const control =
      await page.$(
        selector
      );


    if (control) {

      const datos =
        await page.evaluate(

          el => ({

            tag:
              el.tagName
                .toLowerCase(),

            readonly:
              el.hasAttribute(
                "readonly"
              ),

            disabled:
              (
                el.hasAttribute(
                  "disabled"
                )

                ||

                el.getAttribute(
                  "aria-disabled"
                ) ===
                "true"
              )
          }),

          control
        );


      if (
        datos.disabled
      ) {

        return false;
      }


      // ---------------------------------
      // SELECT HTML NATIVO
      // ---------------------------------

      if (
        datos.tag ===
        "select"
      ) {

        const seleccionado =
          await page.evaluate(

            (
              el,
              valor
            ) => {

              function norm(
                texto = ""
              ) {

                return String(texto)
                  .normalize(
                    "NFD"
                  )
                  .replace(
                    /[\u0300-\u036f]/g,
                    ""
                  )
                  .toLowerCase()
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();
              }


              const buscado =
                norm(valor);


              const opcion =
                Array.from(
                  el.options
                )
                .find(
                  opcion =>
                    norm(
                      opcion.textContent
                    )
                    .includes(
                      buscado
                    )
                );


              if (!opcion) {
                return false;
              }


              el.value =
                opcion.value;


              el.dispatchEvent(
                new Event(
                  "input",
                  {
                    bubbles:
                      true
                  }
                )
              );


              el.dispatchEvent(
                new Event(
                  "change",
                  {
                    bubbles:
                      true
                  }
                )
              );


              return true;

            },

            control,
            valor
          );


        if (
          seleccionado
        ) {

          await pausa(
            700
          );

          return true;
        }
      }


      // ---------------------------------
      // ANGULAR / MATERIAL / CUSTOM
      // ---------------------------------

      await control.click();

      await pausa(
        500
      );


      /*
       * Si es input editable,
       * escribimos la opción.
       *
       * Nuevamente:
       * NO Control+A.
       */

      if (
        datos.tag ===
          "input"
        &&
        !datos.readonly
      ) {

        await control.click(
          {
            clickCount:
              3
          }
        );


        await page
          .keyboard
          .press(
            "Backspace"
          );


        await control.type(
          String(valor),
          {
            delay:
              30
          }
        );


        await pausa(
          500
        );
      }


      // ---------------------------------
      // OPCIÓN EXACTA
      // ---------------------------------

      let elegido =
        await clickTexto(
          page,
          valor,
          {
            exacto:
              true,

            espera:
              800
          }
        );


      // ---------------------------------
      // OPCIÓN PARCIAL
      // ---------------------------------

      if (!elegido) {

        elegido =
          await clickTexto(
            page,
            valor,
            {
              exacto:
                false,

              espera:
                800
            }
          );
      }


      if (elegido) {
        return true;
      }


      // ---------------------------------
      // AUTOCOMPLETE
      // ---------------------------------

      if (
        datos.tag ===
          "input"
        &&
        !datos.readonly
      ) {

        await page
          .keyboard
          .press(
            "ArrowDown"
          );


        await pausa(
          200
        );


        await page
          .keyboard
          .press(
            "Enter"
          );


        await pausa(
          700
        );


        const seleccionado =
          await page.evaluate(

            (
              el,
              valor
            ) => {

              function norm(
                texto = ""
              ) {

                return String(texto)
                  .normalize(
                    "NFD"
                  )
                  .replace(
                    /[\u0300-\u036f]/g,
                    ""
                  )
                  .toLowerCase()
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();
              }


              const actual =
                norm(

                  el.value

                  ||

                  el.innerText

                  ||

                  el.textContent

                  ||

                  ""
                );


              return (
                actual.includes(
                  norm(valor)
                )
              );

            },

            control,
            valor
          );


        if (
          seleccionado
        ) {

          return true;
        }
      }
    }
  }


  // =====================================================
  // FALLBACK
  // =====================================================

  const abierto =
    await clickTexto(
      page,
      campo,
      {
        exacto:
          true,

        espera:
          500
      }
    );


  if (!abierto) {
    return false;
  }


  let elegido =
    await clickTexto(
      page,
      valor,
      {
        exacto:
          true,

        espera:
          800
      }
    );


  if (!elegido) {

    elegido =
      await clickTexto(
        page,
        valor,
        {
          exacto:
            false,

          espera:
            800
        }
      );
  }


  return elegido;
}


// ========================================================
// DETECTAR CAPTCHA VISUAL
// ========================================================

async function captchaVisual(
  page
) {

  return await page.evaluate(
    () => {

      const iframes =
        Array.from(
          document
            .querySelectorAll(
              "iframe"
            )
        );


      return iframes.some(
        frame => {

          const src =
            frame.src ||
            "";


          if (
            !/recaptcha|captcha/i
              .test(src)
          ) {

            return false;
          }


          const rect =
            frame
              .getBoundingClientRect();


          return (
            rect.width > 100
            &&
            rect.height > 100
          );
        }
      );
    }
  );
}


// ========================================================
// ESTADO DE PÁGINA
// ========================================================

async function estadoPagina(
  page
) {

  return await page.evaluate(
    () => ({

      url:
        location.href,


      title:
        document.title,


      texto:
        (
          document
            .body
            ?.innerText
          ||
          ""
        )
        .substring(
          0,
          2500
        ),


      botones:
        Array.from(
          document
            .querySelectorAll(
              [
                "button",
                "[role='button']"
              ].join(",")
            )
        )
        .map(
          el =>
            (
              el.innerText

              ||

              el.getAttribute(
                "aria-label"
              )

              ||

              ""
            )
            .trim()
        )
        .filter(Boolean)
        .slice(
          0,
          30
        ),


      campos:
        Array.from(
          document
            .querySelectorAll(
              [
                "input",

                "select",

                "[role='combobox']",

                "[aria-haspopup='listbox']",

                "mat-select"
              ].join(",")
            )
        )
        .map(
          el => ({

            tag:
              el.tagName
                .toLowerCase(),

            id:
              el.id ||
              "",

            name:
              el.getAttribute(
                "name"
              )
              ||
              "",

            role:
              el.getAttribute(
                "role"
              )
              ||
              "",

            ariaLabel:
              el.getAttribute(
                "aria-label"
              )
              ||
              "",

            placeholder:
              el.getAttribute(
                "placeholder"
              )
              ||
              "",

            value:
              el.value
              ||
              el.innerText
              ||
              ""
          })
        )
        .slice(
          0,
          30
        ),


      grecaptcha:
        typeof window
          .grecaptcha
        !==
        "undefined"
    })
  );
}


// ========================================================
// ESPERAR RESPUESTA DE RESERVA
// ========================================================

async function esperarReserva(
  page,
  timeout = 25000
) {

  try {

    const response =
      await page
        .waitForResponse(

          response =>

            response
              .url()
              .includes(
                RESERVA_ENDPOINT
              )

            &&

            response
              .request()
              .method()
            ===
            "POST",

          {
            timeout
          }
        );


    const texto =
      await response.text();


    let data;


    try {

      data =
        JSON.parse(
          texto
        );

    } catch {

      data = {
        raw:
          texto
      };
    }


    return {

      detectada:
        true,

      httpStatus:
        response.status(),

      data
    };


  } catch {

    return {

      detectada:
        false
    };
  }
}


// ========================================================
// EJECUTAR RESERVA
// ========================================================

async function ejecutarReserva(
  page
) {

  /*
   * Empezamos a escuchar
   * antes de pulsar Reservar.
   */

  const esperaReserva =
    esperarReserva(
      page,
      25000
    );


  const click =
    await clickTexto(
      page,
      [
        "Reservar"
      ],
      {
        exacto:
          true,

        espera:
          200
      }
    );


  if (!click) {

    return {

      ok:
        false,

      estado:
        "boton_reservar_no_encontrado"
    };
  }


  const reserva =
    await esperaReserva;


  // =====================================================
  // BUPA RESPONDIÓ
  // =====================================================

  if (
    reserva.detectada
  ) {

    const data =
      reserva.data;


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
        ?.Tipo;


    if (
      reserva.httpStatus >=
        200

      &&

      reserva.httpStatus <
        300

      &&

      (
        idCita

        ||

        tipo ===
          "S"
      )
    ) {

      return {

        ok:
          true,

        estado:
          "reservada",

        idCita,

        respuestaBupa:
          data
      };
    }


    return {

      ok:
        false,

      estado:
        "respuesta_reserva_error",

      httpStatus:
        reserva.httpStatus,

      respuestaBupa:
        data
    };
  }


  // =====================================================
  // NO HUBO RESPUESTA
  // =====================================================

  await pausa(
    1000
  );


  if (
    await captchaVisual(
      page
    )
  ) {

    return {

      ok:
        false,

      estado:
        "requiere_verificacion"
    };
  }


  return {

    ok:
      false,

    estado:
      "sin_respuesta_reserva"
  };
}


// ========================================================
// AVANZAR FLUJO
// ========================================================

async function avanzarFlujo(
  page,
  entrada
) {

  const {

    paciente = {},

    reserva = {}

  } =
    entrada;


  // =====================================================
  // RUT
  // =====================================================

  if (
    paciente.rut
  ) {

    const okRut =
      await llenarCampo(
        page,
        [
          "rut",

          "documento",

          "rut paciente"
        ],
        paciente.rut
      );


    await pausa(
      500
    );


    if (!okRut) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "RUT"
      };
    }
  }


  // =====================================================
  // PREVISIÓN
  // =====================================================

  if (
    paciente.prevision
  ) {

    const okPrevision =
      await seleccionarOpcion(
        page,
        "prevision",
        paciente.prevision
      );


    await pausa(
      700
    );


    if (
      !okPrevision
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "PREVISION",

        buscado:
          paciente.prevision
      };
    }
  }


  // =====================================================
  // ACEPTAR DATOS PACIENTE
  // =====================================================

  const okContinuarInicial =
    await clickTexto(
      page,

      [
        "Aceptar",

        "Continuar",

        "Buscar"
      ],

      {
        exacto:
          true,

        espera:
          1500
      }
    );


  if (
    !okContinuarInicial
  ) {

    return {

      ...(
        await estadoPagina(
          page
        )
      ),

      errorPaso:
        "CONTINUAR_INICIAL"
    };
  }


  // =====================================================
  // ESPECIALIDAD
  // =====================================================

  if (
    reserva.especialidad
  ) {

    const okEspecialidad =
      await seleccionarOpcion(
        page,
        "especialidad",
        reserva.especialidad
      );


    await pausa(
      700
    );


    if (
      !okEspecialidad
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "ESPECIALIDAD",

        buscado:
          reserva.especialidad
      };
    }
  }


  // =====================================================
  // CENTRO
  // =====================================================

  /*
   * Solo se ejecuta si
   * reserva.centro existe.
   *
   * centroCodigo no activa
   * esta selección.
   */

  if (
    reserva.centro
  ) {

    const okCentro =
      await seleccionarOpcion(
        page,
        "centro",
        reserva.centro
      );


    await pausa(
      700
    );


    if (
      !okCentro
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "CENTRO",

        buscado:
          reserva.centro
      };
    }
  }


  // =====================================================
  // BUSCAR
  // =====================================================

  const okBuscar =
    await clickTexto(
      page,

      [
        "Buscar",

        "Continuar",

        "Aceptar"
      ],

      {
        exacto:
          true,

        espera:
          1800
      }
    );


  if (
    !okBuscar
  ) {

    return {

      ...(
        await estadoPagina(
          page
        )
      ),

      errorPaso:
        "BUSCAR_HORAS"
    };
  }


  // =====================================================
  // PROFESIONAL
  // =====================================================

  if (
    reserva.profesional
  ) {

    const okProfesional =
      await clickTexto(
        page,

        reserva.profesional,

        {
          exacto:
            false,

          espera:
            1200
        }
      );


    if (
      !okProfesional
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "PROFESIONAL",

        buscado:
          reserva.profesional
      };
    }
  }


  // =====================================================
  // FECHA
  // =====================================================

  if (
    reserva.fechaTexto
    ||
    reserva.fecha
  ) {

    const okFecha =
      await clickTexto(
        page,

        [
          reserva.fechaTexto,

          reserva.fecha
        ]
        .filter(Boolean),

        {
          exacto:
            true,

          espera:
            1200
        }
      );


    if (
      !okFecha
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "FECHA",

        buscado:
          reserva.fechaTexto
          ||
          reserva.fecha
      };
    }
  }


  // =====================================================
  // HORA
  // =====================================================

  if (
    reserva.hora
  ) {

    const horaCorta =
      String(
        reserva.hora
      )
      .substring(
        0,
        5
      );


    const okHora =
      await clickTexto(
        page,

        [
          horaCorta,

          reserva.hora
        ],

        {
          exacto:
            true,

          espera:
            1200
        }
      );


    if (
      !okHora
    ) {

      return {

        ...(
          await estadoPagina(
            page
          )
        ),

        errorPaso:
          "HORA",

        buscado:
          horaCorta
      };
    }
  }


  // =====================================================
  // CONTINUAR HASTA CONFIRMACIÓN
  // =====================================================

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

        [
          "Continuar",

          "Aceptar"
        ],

        {
          exacto:
            true,

          espera:
            1200
        }
      );


    if (!pudo) {
      break;
    }
  }


  await pausa(
    1200
  );


  return await estadoPagina(
    page
  );
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


    // ====================================================
    // HOME
    // ====================================================

    if (
      url.pathname ===
      "/"
    ) {

      return json(
        {
          ok:
            true,

          servicio:
            "IntegraMedica Browser",

          rutas:
            [
              "/sessions",

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

        return json(
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


      } catch (
        error
      ) {

        return json(
          {
            ok:
              false,

            error:
              String(
                error?.stack
                ||
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


        // -----------------------------------------------
        // CONFIRMACIÓN EXPLÍCITA
        // -----------------------------------------------

        if (
          entrada.confirmar !==
          true
        ) {

          return json(
            {
              ok:
                false,

              estado:
                "requiere_confirmacion"
            },

            400
          );
        }


        // -----------------------------------------------
        // RUT
        // -----------------------------------------------

        if (
          !entrada
            ?.paciente
            ?.rut
        ) {

          return json(
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


        // -----------------------------------------------
        // HORA
        // -----------------------------------------------

        if (
          !entrada
            ?.reserva
            ?.hora
        ) {

          return json(
            {
              ok:
                false,

              estado:
                "datos_incompletos",

              faltante:
                "reserva.hora"
            },

            400
          );
        }


        // -----------------------------------------------
        // CREAR UNA SOLA SESIÓN
        // -----------------------------------------------

        browser =
          await puppeteer.launch(
            env.BROWSER,

            {
              keep_alive:
                KEEP_ALIVE_MS
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


        // -----------------------------------------------
        // ABRIR AGENDA
        // -----------------------------------------------

        await page.goto(
          AGENDA_URL,

          {
            waitUntil:
              "domcontentloaded",

            timeout:
              20000
          }
        );


        await pausa(
          1200
        );


        // -----------------------------------------------
        // RECORRER FLUJO
        // -----------------------------------------------

        const pagina =
          await avanzarFlujo(
            page,
            entrada
          );


        // -----------------------------------------------
        // NO LLEGÓ A CONFIRMACIÓN
        // -----------------------------------------------

        if (
          !page
            .url()
            .includes(
              "reserva-confirmar-hora"
            )
        ) {

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


          return json(
            {
              ok:
                false,

              estado:
                "requiere_intervencion",

              motivo:
                "No fue posible llegar automáticamente a la pantalla final.",

              sessionId,

              liveViewUrl:
                lv,

              pagina
            }
          );
        }


        // -----------------------------------------------
        // reCAPTCHA DEBE ESTAR CARGADO
        // -----------------------------------------------

        const captchaListo =
          await page.evaluate(

            () =>

              typeof window
                .grecaptcha

              !==

              "undefined"
          );


        if (
          !captchaListo
        ) {

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


          return json(
            {
              ok:
                false,

              estado:
                "requiere_intervencion",

              motivo:
                "La pantalla final cargó, pero reCAPTCHA aún no está disponible.",

              sessionId,

              liveViewUrl:
                lv
            }
          );
        }


        // -----------------------------------------------
        // RESERVAR
        // -----------------------------------------------

        const resultado =
          await ejecutarReserva(
            page
          );


        // -----------------------------------------------
        // ÉXITO
        // -----------------------------------------------

        if (
          resultado.estado ===
          "reservada"
        ) {

          await browser.close();


          browser =
            null;


          return json(
            {
              ok:
                true,

              estado:
                "reservada",

              idCita:
                resultado.idCita
                ||
                null,

              respuestaBupa:
                resultado.respuestaBupa
            }
          );
        }


        // -----------------------------------------------
        // CAPTCHA HUMANO
        // -----------------------------------------------

        if (
          resultado.estado ===
          "requiere_verificacion"
        ) {

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


          return json(
            {
              ok:
                false,

              estado:
                "requiere_verificacion",

              sessionId,

              liveViewUrl:
                lv,

              mensaje:
                "Bupa requiere verificación humana. Resuélvela en Live View y luego llama /continuar-verificacion."
            }
          );
        }


        // -----------------------------------------------
        // OTRO ERROR
        // -----------------------------------------------

        const paginaFinal =
          await estadoPagina(
            page
          );


        await browser.close();


        browser =
          null;


        return json(
          {
            ok:
              false,

            ...resultado,

            pagina:
              paginaFinal
          },

          400
        );


      } catch (
        error
      ) {

        if (
          browser
          &&
          !mantener
        ) {

          try {

            await browser.close();

          } catch (_) {}
        }


        return json(
          {
            ok:
              false,

            estado:
              "error_flujo",

            error:
              String(
                error?.stack
                ||
                error
              )
          },

          500
        );
      }
    }


    // ====================================================
    // CONTINUAR DESPUÉS DE CAPTCHA
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

          return json(
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

          return json(
            {
              ok:
                false,

              error:
                "Falta sessionId"
            },

            400
          );
        }


        browser =
          await puppeteer
            .connect(
              env.BROWSER,
              entrada.sessionId
            );


        const page =
          await obtenerPagina(
            browser
          );


        await pausa(
          800
        );


        const resultado =
          await ejecutarReserva(
            page
          );


        // -----------------------------------------------
        // ÉXITO
        // -----------------------------------------------

        if (
          resultado.estado ===
          "reservada"
        ) {

          await browser.close();


          browser =
            null;


          return json(
            {
              ok:
                true,

              estado:
                "reservada",

              idCita:
                resultado.idCita
                ||
                null,

              respuestaBupa:
                resultado.respuestaBupa
            }
          );
        }


        // -----------------------------------------------
        // SIGUE CAPTCHA
        // -----------------------------------------------

        if (
          resultado.estado ===
          "requiere_verificacion"
        ) {

          const lv =
            await liveView(
              page
            );


          browser
            .disconnect();


          browser =
            null;


          return json(
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


        // -----------------------------------------------
        // OTRO ESTADO
        // -----------------------------------------------

        const pagina =
          await estadoPagina(
            page
          );


        await browser.close();


        browser =
          null;


        return json(
          {
            ok:
              false,

            ...resultado,

            pagina
          },

          400
        );


      } catch (
        error
      ) {

        try {

          if (browser) {
            await browser.close();
          }

        } catch (_) {}


        return json(
          {
            ok:
              false,

            estado:
              "error_continuar",

            error:
              String(
                error?.stack
                ||
                error
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

      const sessionId =
        url
          .searchParams
          .get(
            "sessionId"
          );


      if (
        !sessionId
      ) {

        return json(
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

        const browser =
          await puppeteer
            .connect(
              env.BROWSER,
              sessionId
            );


        await browser.close();


        return json(
          {
            ok:
              true,

            estado:
              "sesion_cerrada"
          }
        );


      } catch {

        return json(
          {
            ok:
              false,

            estado:
              "sesion_no_disponible",

            mensaje:
              "La sesión probablemente ya expiró o fue cerrada."
          },

          404
        );
      }
    }


    // ====================================================
    // RUTA DESCONOCIDA
    // ====================================================

    return json(
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
