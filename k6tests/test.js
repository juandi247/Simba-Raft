
import http from 'k6/http';

import { sleep, check } from 'k6';

import { Counter, Rate, Trend } from 'k6/metrics';

// ============================================
// CONFIGURACIÓN
// ============================================

const BASE_URL = 'http://localhost:8080';

const MIN_TICKS = 1000;
const MAX_TICKS = 2000;

// Debe coincidir con un valor válido de simulator.FuzzyLevel
const FUZZ_LEVEL = "low";

// Tiempo máximo permitido para una conexión SSE.
// Aumentarlo si las simulaciones tardan más.
const SSE_TIMEOUT = '10m';

// ============================================
// MÉTRICAS PERSONALIZADAS
// ============================================

const simulationDuration = new Trend('simulation_duration');
const simulationEvents = new Counter('simulation_events');
const completedSimulations = new Counter('completed_simulations');
const failedSimulations = new Counter('failed_simulations');
const simulationSuccess = new Rate('simulation_success');

// ============================================
// CONFIGURACIÓN DE CARGA
// ============================================


export const options = {
  scenarios: {
    simba_load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Calentamiento
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },

        // Escalado progresivo
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },

        { duration: '2m', target: 1000 },
        { duration: '3m', target: 1000 },

        { duration: '2m', target: 3000 },
        { duration: '3m', target: 3000 },

        // Descenso de carga
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },

  // No permitas que k6 mantenga la prueba viva indefinidamente.
  // Ajusta según la duración real de tus simulaciones.
  gracefulStop: '30s',

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    checks: ['rate>0.99'],
    simulation_success: ['rate>0.99'],
    simulation_duration: ['p(95)<600000'],
  },
};


// ============================================
// UTILIDADES
// ============================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function recordFailure() {
  failedSimulations.add(1);
  simulationSuccess.add(false);
}

// ============================================
// FLUJO PRINCIPAL
// ============================================


export default async function () {

  const seed = randomInt(1, 2147483647);
  const maxTicks = randomInt(MIN_TICKS, MAX_TICKS);

  // ------------------------------------------
  // 1. Cargar página de simulación
  // ------------------------------------------

  const page = http.get(`${BASE_URL}/simulation`, {
    tags: { endpoint: 'simulation' },
  });

  const pageOK = check(page, {
    'GET /simulation returns 200': (r) => r.status === 200,
  });

  if (!pageOK) {
    recordFailure();
    return;
  }

  // ------------------------------------------
  // 2. Configurar simulación
  // ------------------------------------------

  const config = http.post(
    `${BASE_URL}/configsim`,
    JSON.stringify({
      Seed: seed,
      FuzzLevel: FUZZ_LEVEL,
      MaxTicks: maxTicks,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { endpoint: 'configsim' },
    }
  );

  const configOK = check(config, {
    'POST /configsim returns 200': (r) => r.status === 200,
    'POST /configsim returns JSON': (r) =>
      (r.headers['Content-Type'] || '').includes('application/json'),
  });

  if (!configOK) {
    recordFailure();
    return;
  }

  let uid;

  try {
    uid = config.json('Uid');
  } catch (_) {
    recordFailure();
    return;
  }

  const uidOK = check(uid, {
    'configsim returns a UID': (value) =>
      typeof value === 'string' && value.length > 0,
  });

  if (!uidOK) {
    recordFailure();
    return;
  }

  // ------------------------------------------
  // 3. Abrir SSE antes de iniciar
  // ------------------------------------------

  // asyncRequest permite mantener la conexión pendiente
  // mientras ejecutamos /startsim.
  const ssePromise = http.asyncRequest(
    'GET',
    `${BASE_URL}/events?uid=${encodeURIComponent(uid)}`,
    null,
    {
      timeout: SSE_TIMEOUT,
      tags: { endpoint: 'events' },
    }
  );

  // Dar tiempo al servidor para establecer SSE.
  sleep(0.2);

  // ------------------------------------------
  // 4. Iniciar simulación
  // ------------------------------------------

  const startedAt = Date.now();

  const start = http.get(
    `${BASE_URL}/startsim?uid=${encodeURIComponent(uid)}`,
    {
      timeout: '30s',
      tags: { endpoint: 'startsim' },
    }
  );

  const startOK = check(start, {
    'GET /startsim returns 200': (r) => r.status === 200,
  });

  if (!startOK) {
    recordFailure();

    // Esperar a resolver la petición SSE pendiente.
    // Si el backend no cierra la conexión, esperará al timeout.
    try {
      await ssePromise;
    } catch (_) {
      // Error esperado si vence el timeout de SSE.
    }

    return;
  }

  // ------------------------------------------
  // 5. Esperar el cierre de SSE
  // ------------------------------------------

  let eventsResponse;

  try {
    eventsResponse = await ssePromise;
  } catch (_) {
    simulationDuration.add(Date.now() - startedAt);
    recordFailure();
    return;
  }

  const elapsedMs = Date.now() - startedAt;
  simulationDuration.add(elapsedMs);

  // ------------------------------------------
  // 6. Validar respuesta SSE
  // ------------------------------------------

  const contentType =
    eventsResponse.headers['Content-Type'] || '';

  const body = eventsResponse.body || '';

  // Cada evento SSE de tu handler empieza con "data:"
  const eventCount = (body.match(/^data:/gm) || []).length;

  simulationEvents.add(eventCount);

  const sseOK = check(eventsResponse, {
    'SSE returns HTTP 200': (r) => r.status === 200,

    'SSE has text/event-stream content type': () =>
      contentType.includes('text/event-stream'),

    'SSE received at least one event': () => eventCount > 0,
  });


  // ------------------------------------------
  // 7. Registrar resultado
  // ------------------------------------------

  const success =
    startOK &&
    sseOK &&
    eventCount > 0;

  if (success) {
    completedSimulations.add(1);

  } else {
    failedSimulations.add(1);
  }

  simulationSuccess.add(success);
}

