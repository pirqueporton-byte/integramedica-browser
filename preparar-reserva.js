// Preparación mediante los controles de la agenda oficial. No confirma citas.
const AGENDA = 'https://agenda.bupa.cl/integramedica/consulta-medica/reserva-consulta-medica';
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAYS = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Función autocontenida: Puppeteer la ejecuta dentro de la página.
export function lateralSummaryReady(target, sourceText = null) {
  const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const text = norm(sourceText === null ? document.body.innerText : sourceText);
  const start = text.lastIndexOf('resumen de tu hora');
  if (start < 0) return false;
  const summary = text.slice(start);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const date = norm(target.dateLabel).replace(/^0/,'');
  // El formato puede usar coma, salto de línea o "a las" entre fecha y hora.
  const dateTime = new RegExp('\\b0?' + escape(date) + '(?:[\\s,;:–—-]+|\\s+a\\s+las\\s+)' + escape(target.time) + '(?::00)?\\b');
  const words = norm(target.professional).split(' ');
  return dateTime.test(summary) && summary.includes(norm(target.center)) &&
    words.every(word => new RegExp('(?:^|\\W)' + escape(word) + '(?:$|\\W)').test(summary));
}

export function validatePreparation(input, today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago'}).format(new Date())) {
  const p = input?.paciente || {}, r = input?.reserva || {};
  for (const [key, value] of Object.entries({rut:p.rut, previsionNombre:p.previsionNombre, profesionalNombre:r.profesionalNombre, especialidadNombre:r.especialidadNombre, prestacionNombre:r.prestacionNombre, centroNombre:r.centroNombre, fecha:r.fecha, hora:r.hora})) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) throw new Error('Fecha inválida');
  const date = new Date(`${r.fecha}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== r.fecha) throw new Error('Fecha inválida');
  const offset = (date - new Date(`${today}T12:00:00Z`)) / 86400000;
  if (offset < 0 || offset > 29) throw new Error('Esta versión prepara fechas entre hoy y los próximos 29 días');
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(r.hora)) throw new Error('Hora inválida');
  // El recorrido validado es presencial. No inferir modalidad desde una categoría API.
  if (r.modalidad !== 'presencial') throw new Error('Indica modalidad: presencial');
  return {p, r, dayLabel:`${DAYS[date.getUTCDay()]} ${date.getUTCDate()}`, dateLabel:`${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`, time:r.hora.slice(0,5)};
}

// Exactitud + visibilidad: nunca escoger la primera coincidencia de varios días/centros.
async function matchingHandle(page, selector, text, words = false) {
  const handle = await page.waitForFunction((selector, target, words) => {
    const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const key = s => words ? norm(s).split(' ').sort().join(' ') : norm(s);
    const matches = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length && key(el.textContent) === key(target));
    return matches.length === 1 ? matches[0] : false;
  }, {timeout:30000}, selector, text, words);
  return handle.asElement();
}

async function clickText(page, selector, text, words = false) {
  const el = await matchingHandle(page, selector, text, words);
  try { await el.click(); } finally { await el.dispose(); }
}

async function input(page, selector, value) {
  await page.waitForSelector(selector, {visible:true, timeout:30000});
  await page.click(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, value, {delay:65});
}

async function selectOption(page, selector, label, words = false, search = '') {
  await page.waitForSelector(selector, {visible:true, timeout:30000});
  await page.click(selector);
  if (search) await input(page, selector, search);
  await clickText(page, 'mat-option', label, words);
  await page.waitForFunction((selector, label, words) => {
    const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const key = s => words ? norm(s).split(' ').sort().join(' ') : norm(s);
    return key(document.querySelector(selector)?.value || '') === key(label);
  }, {timeout:10000}, selector, label, words);
}

async function button(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.getClientRects().length && !b.disabled && b.textContent.trim() === text), {timeout:45000}, text);
  await clickText(page, 'button', text);
}

export async function prepareOfficialPage(page, inputData, onStep = () => {}) {
  const target = validatePreparation(inputData);
  const {p,r,dayLabel,dateLabel,time} = target;
  onStep('datos_paciente');
  await page.goto(AGENDA, {waitUntil:'domcontentloaded',timeout:45000});
  await input(page, 'input[placeholder="Ingresa RUT del paciente"]', p.rut);
  await page.keyboard.press('Tab');
  await selectOption(page, 'input[name="previsionAutoComp"]', p.previsionNombre);
  await button(page, 'Aceptar');

  onStep('profesional');
  await clickText(page, '[role="tab"]', 'Profesional');
  // La API entrega apellidos primero; la interfaz usa nombres primero.
  // Comparar todas las palabras, no sólo el apellido usado para buscar.
  const search = r.profesionalBusqueda || r.profesionalNombre.trim().split(/\s+/)[0];
  await selectOption(page, 'input[name="profesionalAutoComp"]', r.profesionalNombre, true, search);
  await selectOption(page, 'input[name="especialidadAutoComp"]', r.especialidadNombre);
  await selectOption(page, 'input[name="prestacionAutoComp"]', r.prestacionNombre);
  const check = await page.$('input[type="checkbox"]');
  if (!check) throw new Error('No se encontró el selector de próximos 7 días');
  if (await check.evaluate(el => el.checked)) await check.click();
  await check.dispose();
  await button(page, 'Buscar fecha en el calendario');

  onStep('fecha');
  await clickText(page, 'p', dayLabel);
  await button(page, 'Buscar hora');

  onStep('hora');
  // Encontrar el bloque mínimo que contiene fecha, centro y la hora exacta.
  // Evita elegir el mismo horario de la semana siguiente.
  const slotHandle = await page.waitForFunction(({dateLabel,center,time}) => {
    const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const dates = /\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g;
    const candidates = [];
    for (const b of document.querySelectorAll('button')) {
      if (!b.getClientRects().length || b.disabled || b.textContent.trim() !== time) continue;
      for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) {
        const text = norm(el.innerText || '');
        const found = [...text.matchAll(dates)].map(m => m[0].replace(/^0/,''));
        if (new Set(found).size > 1) break;
        if (found.includes(norm(dateLabel)) && text.includes(norm(center))) { candidates.push(b); break; }
      }
    }
    return candidates.length === 1 ? candidates[0] : false;
  }, {timeout:60000}, {dateLabel,center:r.centroNombre,time});
  try { await slotHandle.asElement().click(); } finally { await slotHandle.dispose(); }
  onStep('resumen_lateral');
  // El resumen lateral tiene que coincidir antes de continuar.
  try {
    await page.waitForFunction(lateralSummaryReady, {timeout:30000}, {
      dateLabel,time,center:r.centroNombre,professional:r.profesionalNombre
    });
  } catch {
    const pathname = new URL(page.url()).pathname;
    if (pathname.endsWith('/reserva-filtro-flujo') || pathname.endsWith('/reserva-consulta-medica')) {
      throw new Error('NAVEGACION_REINICIADA: la agenda regresó al formulario antes de validar la hora. No se confirmó ninguna reserva.');
    }
    throw new Error('RESUMEN_NO_VALIDADO: no apareció en 30 segundos un resumen lateral con el médico, centro, fecha y hora solicitados. No se confirmó ninguna reserva.');
  }
  onStep('continuar_resumen');
  await button(page, 'Continuar');

  onStep('resumen');
  await page.waitForFunction(() => location.pathname.endsWith('/reserva-confirmar-hora') && [...document.querySelectorAll('button')].some(b => b.getClientRects().length && b.textContent.trim() === 'Reservar'), {timeout:45000});
  const summary = await page.evaluate(() => document.body.innerText);
  if (!normalize(summary).includes(normalize(`${dateLabel} a las ${time}`)) || !normalize(summary).includes(normalize(r.centroNombre))) throw new Error('El resumen final no coincide con la fecha/hora/centro solicitados');
  // Deliberadamente NO hacer click en Reservar ni ejecutar/reutilizar CAPTCHA.
  return {fecha:r.fecha,hora:time,profesional:r.profesionalNombre,centro:r.centroNombre,prestacion:r.prestacionNombre};
}

export async function prepareRoute(request, env, puppeteer, json) {
  let data;
  try { data = await request.json(); validatePreparation(data); }
  catch (e) { return json({ok:false,estado:'datos_incompletos',error:e.message},400); }
  let browser, page, paso = 'iniciar_navegador';
  try {
    browser = await puppeteer.launch(env.BROWSER, {keep_alive:600000});
    page = await browser.newPage();
    const resumen = await prepareOfficialPage(page,data,s => {paso=s;});
    const cdp = await page.createCDPSession();
    const {devtoolsFrontendUrl} = await cdp.send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:600000});
    await cdp.detach();
    return json({ok:true,estado:'lista_para_confirmar',reservada:false,sessionId:browser.sessionId(),liveViewUrl:devtoolsFrontendUrl,paso,resumen,mensaje:'La agenda está preparada. Revisa el resumen y confirma en la página oficial.',inactividadMaximaMs:600000});
  } catch (e) {
    // Un error de navegación no equivale a un CAPTCHA. Preservar la página para diagnóstico.
    let liveViewUrl;
    if (page) try {
      const cdp = await page.createCDPSession();
      liveViewUrl = (await cdp.send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:600000})).devtoolsFrontendUrl;
      await cdp.detach();
    } catch {}
    let paginaActual = null;
    try { if (page) paginaActual = new URL(page.url()).pathname; } catch {}
    return json({ok:false,estado:'preparacion_incompleta',version:'preparacion-0.2',reservada:false,paso,paginaActual,error:e.message,sessionId:browser?.sessionId(),liveViewUrl},502);
  } finally {
    if (browser) await browser.disconnect();
  }
}
