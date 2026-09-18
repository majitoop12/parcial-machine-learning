const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const SIATA_API_URL = 'https://siata.gov.co/EntregaData1/Datos_SIATA_Aire_AQ_pm25_Last.json';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// Caché en memoria para datos de SIATA
let cachedSiataData = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Cargar datos locales de respaldo al iniciar
let fallbackData = null;
try {
  const samplePath = path.join(__dirname, 'data', 'siata_sample.json');
  if (fs.existsSync(samplePath)) {
    fallbackData = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
    console.log('[AeroSIATA] Datos de respaldo cargados correctamente (' + (fallbackData.measurements ? fallbackData.measurements.length : 0) + ' registros).');
  }
} catch (e) {
  console.warn('[AeroSIATA] No se pudo cargar el archivo local de respaldo:', e.message);
}

async function fetchSiataBackend() {
  const now = Date.now();
  if (cachedSiataData && (now - lastCacheTime < CACHE_TTL_MS)) {
    return {
      success: true,
      source: 'backend-cache',
      cacheAgeSeconds: Math.round((now - lastCacheTime) / 1000),
      timestamp: new Date(lastCacheTime).toISOString(),
      data: cachedSiataData
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(SIATA_API_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AeroSIATA-ValleAburra-Monitor/1.0 (Academic & Public Health Research)',
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.measurements) && data.measurements.length > 0) {
        cachedSiataData = data;
        lastCacheTime = now;
        return {
          success: true,
          source: 'live-siata-api',
          latencyMs,
          timestamp: new Date().toISOString(),
          httpStatus: response.status,
          data
        };
      }
    }
  } catch (err) {
    console.warn('[AeroSIATA] API SIATA remota no respondió (' + err.message + '). Usando caché o respaldo...');
  }

  // Si falló la petición remota pero hay caché previo:
  if (cachedSiataData) {
    return {
      success: true,
      source: 'backend-cache-stale',
      cacheAgeSeconds: Math.round((Date.now() - lastCacheTime) / 1000),
      timestamp: new Date(lastCacheTime).toISOString(),
      data: cachedSiataData
    };
  }

  // Si no hay caché, usar archivo de muestra garantizado
  if (fallbackData) {
    return {
      success: true,
      source: 'local-fallback',
      timestamp: new Date().toISOString(),
      data: fallbackData
    };
  }

  return {
    success: false,
    source: 'unavailable',
    error: 'No se pudo obtener datos de SIATA ni del respaldo local'
  };
}

const server = http.createServer(async (req, res) => {
  // CORS y cabeceras de seguridad
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parsear ruta limpia
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Endpoint de salud
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'AeroSIATA Monitor',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Endpoint proxy para la API de SIATA
  if (pathname === '/api/siata') {
    const forceRefresh = parsedUrl.searchParams.get('refresh') === 'true';
    if (forceRefresh) {
      lastCacheTime = 0; // Invalidar caché
    }

    const result = await fetchSiataBackend();
    const statusCode = result.success ? 200 : 503;

    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-SIATA-Source': result.source || 'unknown'
    });
    res.end(JSON.stringify(result));
    return;
  }

  // Enrutar a index.html por defecto
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Archivo no encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function startServer(port) {
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(` 🌫️ AeroSIATA Valle de Aburrá - Servidor Activo`);
    console.log(`======================================================`);
    console.log(` -> URL Principal:  http://localhost:${port}`);
    console.log(` -> IP Local:       http://127.0.0.1:${port}`);
    console.log(` -> API Proxy SIATA: http://localhost:${port}/api/siata`);
    console.log(` -> Verificación:   http://localhost:${port}/health`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Aviso] El puerto ${port} está ocupado. Intentando en el puerto ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[Error de Servidor]', err);
    }
  });
}

startServer(PORT);
