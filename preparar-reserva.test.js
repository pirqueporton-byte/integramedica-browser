import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePreparation,prepareRoute} from './preparar-reserva.js';
const data=()=>({paciente:{rut:'11111111-1',previsionNombre:'Isapre Cruz Blanca'},reserva:{profesionalNombre:'Nombre Profesional',especialidadNombre:'Medicina General',prestacionNombre:'Consulta Medicina General adulto',centroNombre:'Centro elegido',modalidad:'presencial',fecha:'2026-09-28',hora:'15:30:00'}});
test('fecha y hora sin cambio de día por zona horaria',()=>{const r=validatePreparation(data(),'2026-09-16');assert.equal(r.dayLabel,'LUN 28');assert.equal(r.dateLabel,'28 de septiembre');assert.equal(r.time,'15:30');});
test('rechaza fechas imposibles, pasadas y fuera del calendario',()=>{for(const date of ['2026-02-30','2026-09-15','2026-10-16']){const d=data();d.reserva.fecha=date;assert.throws(()=>validatePreparation(d,'2026-09-16'));}});
test('no infiere modalidad ni acepta selección incompleta',()=>{for(const key of ['modalidad','centroNombre','prestacionNombre','profesionalNombre']){const d=data();delete d.reserva[key];assert.throws(()=>validatePreparation(d,'2026-09-16'));}const d=data();d.reserva.hora='25:30';assert.throws(()=>validatePreparation(d,'2026-09-16'));});
test('JSON inválido no abre navegador',async()=>{let opened=false;const result=await prepareRoute({json:async()=>{throw new Error('JSON inválido');}},{},{launch:()=>{opened=true;}},(body,status)=>({body,status}));assert.equal(result.status,400);assert.equal(opened,false);});
test('fallo de navegación preserva sesión sin declarar CAPTCHA o reserva',async()=>{const d=data();d.reserva.fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());let disconnected=false,closed=false;const page={goto:async()=>{throw new Error('Navegación fallida');},createCDPSession:async()=>({send:async()=>({devtoolsFrontendUrl:'https://example.invalid/live'}),detach:async()=>{}})};const browser={newPage:async()=>page,sessionId:()=> 'session-test',disconnect:async()=>{disconnected=true;},close:async()=>{closed=true;}};const result=await prepareRoute({json:async()=>d},{BROWSER:{}},{launch:async()=>browser},(body,status)=>({body,status}));assert.equal(result.status,502);assert.equal(result.body.estado,'preparacion_incompleta');assert.equal(result.body.reservada,false);assert.equal(result.body.sessionId,'session-test');assert.equal(disconnected,true);assert.equal(closed,false);});

const {lateralSummaryReady}=await import('./preparar-reserva.js');
const expected={dateLabel:'28 de septiembre',time:'15:30',center:'IntegraMédica Plaza Egaña',professional:'Leonardo Esteban Garcia Gonzalez'};
const summary=date=>`Resumen de tu hora\nLeonardo Esteban García González\n${date}\nIntegraMédica Plaza Egaña\nContinuar`;
test('resumen tolera coma, espacios, saltos de línea y a las',()=>{
 for(const date of ['Lunes 28 de Septiembre, 15:30 hrs.','28 de septiembre , 15:30','28 de septiembre\n15:30','28 de septiembre a las 15:30']) assert.equal(lateralSummaryReady(expected,summary(date)),true,date);
});
test('rechaza otra fecha, hora, médico o centro',()=>{
 assert.equal(lateralSummaryReady(expected,summary('5 de octubre, 15:30')),false);
 assert.equal(lateralSummaryReady(expected,summary('28 de septiembre, 15:45')),false);
 assert.equal(lateralSummaryReady(expected,summary('28 de septiembre, 15:30').replace('González','Pérez')),false);
 assert.equal(lateralSummaryReady(expected,summary('28 de septiembre, 15:30').replace('Plaza Egaña','Maipú')),false);
});
test('no confunde listado de horarios con resumen de selección',()=>{
 assert.equal(lateralSummaryReady(expected,'Leonardo Esteban Garcia Gonzalez 28 de septiembre, 15:30 IntegraMédica Plaza Egaña'),false);
 assert.equal(lateralSummaryReady(expected,'28 de septiembre, 15:30 IntegraMédica Plaza Egaña Leonardo Esteban Garcia Gonzalez Resumen de tu hora 5 de octubre, 15:30'),false);
});
