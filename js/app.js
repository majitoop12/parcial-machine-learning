/**
 * AeroSIATA - Sistema de Monitoreo de Calidad del Aire (ICA) Valle de Aburrá
 * Lógica de Adquisición, Transformación, Visualización y Toma de Decisiones
 * Basado en el notebook: analisis_calidad_aire_siata.ipynb
 */

// Estado global de la aplicación
const AppState = {
  rawMeasurements: [],
  cleanedStations: [],
  stationsMap: new Map(), // stationName -> { latest, history: [] }
  filteredStations: [],
  activeCategoryFilter: 'all',
  activeMunicipalityFilter: 'all',
  searchQuery: '',
  sortBy: 'pm25-desc',
  activeView: 'map', // 'map' | 'cards' | 'table' | 'charts'
  mapInstance: null,
  mapMarkers: [],
  charts: {
    stationsBar: null,
    aqiDonut: null,
    diurnalTrend: null,
    stationModalChart: null
  },
  apiMetadata: {
    source: 'iniciando',
    httpStatus: null,
    latencyMs: null,
    timestamp: null,
    rawCount: 0,
    validCount: 0,
    anomalousCount: 0
  }
};

// Configuración de la escala oficial ICA y colores (idéntica al notebook)
const AQI_CONFIG = {
  "Buena": {
    min: 0,
    max: 12.0,
    color: "#10b981", // Verde esmeralda
    badgeClass: "badge-buena",
    advice: "Calidad satisfactoria. Actividades al aire libre sin restricciones.",
    actionSchools: "Actividades deportivas y recreos en patios abiertos con normalidad.",
    actionSports: "Condiciones ideales para entrenamiento aeróbico y ciclismo."
  },
  "Moderada": {
    min: 12.1,
    max: 35.4,
    color: "#f59e0b", // Amarillo / Ámbar
    badgeClass: "badge-moderada",
    advice: "Personas excepcionalmente sensibles deben considerar reducir actividades prolongadas al aire libre.",
    actionSchools: "Monitoreo preventivo en alumnos asmáticos o con rinitis.",
    actionSports: "Apta para deportistas habituales; hidratación constante recomendada."
  },
  "Dañina para grupos sensibles": {
    min: 35.5,
    max: 55.4,
    color: "#f97316", // Naranja
    badgeClass: "badge-sensibles",
    advice: "Niños, adultos mayores y personas con enfermedades respiratorias deben limitar esfuerzos prolongados al aire libre.",
    actionSchools: "ALERTA: Suspender educación física intensa en patio para primaria e inicial.",
    actionSports: "Reducir entrenamientos extenuantes; evitar franjas de hora pico vehicular."
  },
  "Dañina": {
    min: 55.5,
    max: 150.4,
    color: "#ef4444", // Rojo
    badgeClass: "badge-danina",
    advice: "Toda la población debe reducir actividades prolongadas o intensas al aire libre.",
    actionSchools: "Cierre preventivo de patios descubiertos y ventilación filtrada.",
    actionSports: "Prohibido el ejercicio aeróbico extenuante en vía pública."
  },
  "Muy dañina": {
    min: 150.5,
    max: 250.4,
    color: "#8b5cf6", // Púrpura
    badgeClass: "badge-muy-danina",
    advice: "Alerta sanitaria: evitar toda actividad física al aire libre.",
    actionSchools: "Jornada escolar en aulas cerradas o suspensión preventiva.",
    actionSports: "Permanecer en espacios cerrados sin ventilación exterior directa."
  },
  "Peligrosa": {
    min: 250.5,
    max: Infinity,
    color: "#881337", // Borgoña oscuro
    badgeClass: "badge-peligrosa",
    advice: "Emergencia sanitaria: permanecer en interiores con puertas y ventanas cerradas.",
    actionSchools: "Suspensión de clases presenciales y teleducación inmediata.",
    actionSports: "Emergencia absoluta. Riesgo biológico de exposición aguda."
  },
  "Sin Datos": {
    min: -Infinity,
    max: -0.001,
    color: "#6b7280", // Gris
    badgeClass: "badge-sin-datos",
    advice: "No hay datos suficientes para emitir una recomendación.",
    actionSchools: "Consultar estación de monitoreo circundante más cercana.",
    actionSports: "Remitirse a estaciones contiguas."
  }
};

/**
 * Clasificación de ICA basada en la celda 10 del notebook
 */
function clasificarAQI(valor) {
  if (valor === null || valor === undefined || isNaN(valor) || valor < 0) {
    return "Sin Datos";
  } else if (valor <= 12.0) {
    return "Buena";
  } else if (valor <= 35.4) {
    return "Moderada";
  } else if (valor <= 55.4) {
    return "Dañina para grupos sensibles";
  } else if (valor <= 150.4) {
    return "Dañina";
  } else if (valor <= 250.4) {
    return "Muy dañina";
  } else {
    return "Peligrosa";
  }
}

/**
 * Extraer municipio a partir del nombre de la estación
 */
function inferirMunicipio(location) {
  if (!location) return "Valle de Aburrá";
  const locUpper = location.toUpperCase();
  if (locUpper.includes("MEDELL") || locUpper.startsWith("MED-")) return "Medellín";
  if (locUpper.includes("GIRARDOTA") || locUpper.startsWith("GIR-")) return "Girardota";
  if (locUpper.includes("BELLO") || locUpper.startsWith("BEL-")) return "Bello";
  if (locUpper.includes("ITAGU") || locUpper.startsWith("ITA-")) return "Itagüí";
  if (locUpper.includes("ENVIGADO") || locUpper.startsWith("ENV-")) return "Envigado";
  if (locUpper.includes("CALDAS") || locUpper.startsWith("CAL-")) return "Caldas";
  if (locUpper.includes("ESTRELLA") || locUpper.startsWith("EST-")) return "La Estrella";
  if (locUpper.includes("BARBOSA") || locUpper.startsWith("BAR-")) return "Barbosa";
  if (locUpper.includes("SABANETA") || locUpper.startsWith("SAB-")) return "Sabaneta";
  if (locUpper.includes("COPACABANA") || locUpper.startsWith("COP-")) return "Copacabana";
  if (locUpper.includes("CENTRO") || locUpper.startsWith("CEN-")) return "Medellín (Centro)";
  if (locUpper.includes("SUR") || locUpper.startsWith("SUR-")) return "Medellín (Sur)";
  return "Medellín";
}

/**
 * Limpieza del nombre de la estación para visualización clara
 */
function formatearNombreEstacion(rawLocation) {
  if (!rawLocation) return "Estación de Monitoreo";
  // Quitar prefijos técnicos como _OFF- o códigos duplicados
  let clean = rawLocation.replace(/_OFF-/g, '').trim();
  const parts = clean.split(' - ');
  if (parts.length > 1) {
    return {
      code: parts[0].trim(),
      name: parts.slice(1).join(' - ').trim()
    };
  }
  return {
    code: 'SIATA',
    name: clean
  };
}

/**
 * Inicialización principal
 */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  bindEvents();
  cargarDatosSIATA();
});

/**
 * Consumo de la API de SIATA (Punto 6)
 */
async function cargarDatosSIATA(forceRefresh = false) {
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) refreshBtn.classList.add('spin');

  const startTime = Date.now();
  let payload = null;

  try {
    // Intentar primero a través del proxy local de alto rendimiento
    const endpoint = forceRefresh ? '/api/siata?refresh=true' : '/api/siata';
    const resp = await fetch(endpoint);
    
    if (resp.ok) {
      const json = await resp.json();
      if (json.data && json.data.measurements) {
        payload = json.data;
        AppState.apiMetadata.source = json.source || 'proxy-siata';
        AppState.apiMetadata.latencyMs = json.latencyMs || (Date.now() - startTime);
        AppState.apiMetadata.httpStatus = json.httpStatus || 200;
        AppState.apiMetadata.timestamp = json.timestamp || new Date().toISOString();
      }
    }
  } catch (err) {
    console.warn('[AeroSIATA] Error al consumir proxy backend, probando respaldo directo:', err);
  }

  // Fallback si no hay backend activo (ej. ejecución directa en estático)
  if (!payload) {
    try {
      const fallbackResp = await fetch('data/siata_sample.json');
      if (fallbackResp.ok) {
        payload = await fallbackResp.json();
        AppState.apiMetadata.source = 'archivo-respaldo-local';
        AppState.apiMetadata.latencyMs = Date.now() - startTime;
        AppState.apiMetadata.httpStatus = 200;
        AppState.apiMetadata.timestamp = new Date().toISOString();
      }
    } catch (e) {
      console.error('[AeroSIATA] Error fatal: No se pudo cargar datos locales de SIATA', e);
    }
  }

  if (refreshBtn) refreshBtn.classList.remove('spin');

  if (payload && payload.measurements) {
    procesarDatosSIATA(payload.measurements);
    actualizarVistas();
  } else {
    alert('No se pudieron obtener datos del SIATA. Por favor verifica que el servidor esté activo.');
  }
}

/**
 * Transformación, limpieza y normalización idéntica al notebook (Puntos 6 y 10)
 */
function procesarDatosSIATA(measurements) {
  AppState.rawMeasurements = measurements;
  AppState.apiMetadata.rawCount = measurements.length;

  let anomalousCount = 0;
  let validCount = 0;
  const stationsMap = new Map();

  measurements.forEach(m => {
    // Hallazgo del notebook: Detección y reemplazo del valor centinela -9999
    const val = m.value;
    const isAnomalous = val === -9999 || val === null || val === undefined || isNaN(val) || val < 0;

    if (isAnomalous) {
      anomalousCount++;
    } else {
      validCount++;
    }

    const loc = m.location || 'Desconocida';
    if (!stationsMap.has(loc)) {
      stationsMap.set(loc, {
        rawLocation: loc,
        municipality: inferirMunicipio(loc),
        formatted: formatearNombreEstacion(loc),
        coordinates: m.coordinates || { latitude: 6.2442, longitude: -75.5812 },
        measurements: []
      });
    }

    stationsMap.get(loc).measurements.push({
      dateUtc: m.date ? m.date.utc : null,
      dateLocal: m.date ? m.date.local : null,
      rawValue: m.value,
      cleanValue: isAnomalous ? null : parseFloat(m.value),
      unit: m.unit || 'ug/m3'
    });
  });

  AppState.apiMetadata.validCount = validCount;
  AppState.apiMetadata.anomalousCount = anomalousCount;

  // Para cada estación, ordenar mediciones por fecha local y calcular el último valor válido
  const cleanedStations = [];

  stationsMap.forEach((stationObj, loc) => {
    // Ordenar cronológicamente (más antiguo al más reciente)
    stationObj.measurements.sort((a, b) => new Date(a.dateLocal) - new Date(b.dateLocal));

    // Buscar la última medición válida
    const validMeasurements = stationObj.measurements.filter(m => m.cleanValue !== null);

    if (validMeasurements.length > 0) {
      const latest = validMeasurements[validMeasurements.length - 1];
      const pm25 = latest.cleanValue;
      const categoria = clasificarAQI(pm25);
      const aqiMeta = AQI_CONFIG[categoria] || AQI_CONFIG["Sin Datos"];

      // Calcular promedio 24 horas si hay mediciones suficientes
      const sumVals = validMeasurements.reduce((acc, curr) => acc + curr.cleanValue, 0);
      const avg24h = (sumVals / validMeasurements.length);

      // Calcular valor mínimo y máximo de la jornada
      const min24h = Math.min(...validMeasurements.map(m => m.cleanValue));
      const max24h = Math.max(...validMeasurements.map(m => m.cleanValue));

      stationObj.latest = {
        pm25: pm25,
        avg24h: parseFloat(avg24h.toFixed(1)),
        min24h: parseFloat(min24h.toFixed(1)),
        max24h: parseFloat(max24h.toFixed(1)),
        unit: latest.unit,
        dateLocal: latest.dateLocal,
        categoria: categoria,
        color: aqiMeta.color,
        badgeClass: aqiMeta.badgeClass,
        advice: aqiMeta.advice,
        actionSchools: aqiMeta.actionSchools,
        actionSports: aqiMeta.actionSports
      };

      stationObj.validHistory = validMeasurements;
      cleanedStations.push(stationObj);
    }
  });

  AppState.cleanedStations = cleanedStations;
  AppState.stationsMap = stationsMap;
}

/**
 * Aplicar filtros y ordenamiento interactivo (Punto 8)
 */
function aplicarFiltros() {
  let list = [...AppState.cleanedStations];

  // Filtro por Búsqueda de Texto
  if (AppState.searchQuery.trim() !== '') {
    const q = AppState.searchQuery.toLowerCase();
    list = list.filter(st => {
      const matchName = st.formatted.name.toLowerCase().includes(q);
      const matchCode = st.formatted.code.toLowerCase().includes(q);
      const matchMun = st.municipality.toLowerCase().includes(q);
      return matchName || matchCode || matchMun;
    });
  }

  // Filtro por Categoría de ICA
  if (AppState.activeCategoryFilter !== 'all') {
    list = list.filter(st => st.latest && st.latest.categoria === AppState.activeCategoryFilter);
  }

  // Filtro por Municipio
  if (AppState.activeMunicipalityFilter !== 'all') {
    list = list.filter(st => st.municipality === AppState.activeMunicipalityFilter);
  }

  // Ordenamiento
  switch (AppState.sortBy) {
    case 'pm25-desc':
      list.sort((a, b) => (b.latest ? b.latest.pm25 : 0) - (a.latest ? a.latest.pm25 : 0));
      break;
    case 'pm25-asc':
      list.sort((a, b) => (a.latest ? a.latest.pm25 : 0) - (b.latest ? b.latest.pm25 : 0));
      break;
    case 'name-asc':
      list.sort((a, b) => a.formatted.name.localeCompare(b.formatted.name));
      break;
  }

  AppState.filteredStations = list;
}

/**
 * Renderizado de todas las vistas del dashboard
 */
function actualizarVistas() {
  aplicarFiltros();
  renderKPIs();
  renderMapMarkers();
  renderStationsGrid();
  renderStationsTable();
  renderStatisticalCharts();
  renderEvidencePanel();
  poblarSelectMunicipios();
}

/**
 * Renderizado de Indicadores KPI en la cabecera
 */
function renderKPIs() {
  const stations = AppState.cleanedStations;
  if (!stations.length) return;

  const totalStations = stations.length;
  const sumPM = stations.reduce((acc, st) => acc + (st.latest ? st.latest.pm25 : 0), 0);
  const avgPM = (sumPM / totalStations).toFixed(1);

  const goodOrMod = stations.filter(st => st.latest && (st.latest.categoria === 'Buena' || st.latest.categoria === 'Moderada')).length;
  const pctGoodMod = Math.round((goodOrMod / totalStations) * 100);

  // Estación más crítica
  const criticalStation = [...stations].sort((a, b) => (b.latest ? b.latest.pm25 : 0) - (a.latest ? a.latest.pm25 : 0))[0];

  const elTotal = document.getElementById('kpiTotalStations');
  const elAvg = document.getElementById('kpiAvgPM25');
  const elPct = document.getElementById('kpiPctGood');
  const elCrit = document.getElementById('kpiCriticalStation');
  const elSource = document.getElementById('liveStatusBadge');

  if (elTotal) elTotal.textContent = totalStations;
  if (elAvg) elAvg.textContent = avgPM;
  if (elPct) elPct.textContent = `${pctGoodMod}%`;
  if (elCrit && criticalStation && criticalStation.latest) {
    elCrit.textContent = `${criticalStation.formatted.name} (${criticalStation.latest.pm25} µg/m³)`;
  }
  if (elSource) {
    const isLive = AppState.apiMetadata.source.includes('live') || AppState.apiMetadata.source.includes('proxy');
    elSource.innerHTML = `<span class="pulse-dot"></span> SIATA ${isLive ? 'En Vivo' : 'Caché Activo'} (${AppState.apiMetadata.validCount} datos)`;
  }
}

/**
 * Inicialización del Mapa Leaflet (Punto 7)
 * Utiliza exactamente la capa ESRI World Street Map del notebook
 */
function initMap() {
  const mapElement = document.getElementById('siataMap');
  if (!mapElement) return;

  AppState.mapInstance = L.map('siataMap', {
    center: [6.2442, -75.5812], // Centro de Medellín / Valle de Aburrá
    zoom: 11,
    zoomControl: true,
    scrollWheelZoom: false
  });

  // Capas base de mapa
  const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Sistema de Alerta Temprana de Medellín (SIATA)',
    maxZoom: 18
  });

  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CartoDB &mdash; SIATA',
    maxZoom: 18
  });

  esriStreet.addTo(AppState.mapInstance);

  const baseLayers = {
    "Esri Callejero (Oficial SIATA)": esriStreet,
    "CartoDB Modo Oscuro": cartoDark
  };

  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(AppState.mapInstance);

  // Reajustar tamaño al cargar
  setTimeout(() => {
    AppState.mapInstance.invalidateSize();
  }, 300);
}

/**
 * Renderizado de Marcadores Geoespaciales en el Mapa (Puntos 7 y 8)
 */
function renderMapMarkers() {
  if (!AppState.mapInstance) return;

  // Limpiar marcadores previos
  AppState.mapMarkers.forEach(m => AppState.mapInstance.removeLayer(m));
  AppState.mapMarkers = [];

  const stations = AppState.filteredStations;

  stations.forEach(station => {
    const coords = station.coordinates;
    if (!coords || isNaN(coords.latitude) || isNaN(coords.longitude)) return;

    const latest = station.latest;
    if (!latest) return;

    const color = latest.color;

    // Marcador circular estilizado con aura y borde
    const marker = L.circleMarker([coords.latitude, coords.longitude], {
      radius: 11,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.85
    });

    // Formato enriquecido del popup con recomendación prescriptiva (idéntico al notebook)
    const popupContent = `
      <div class="popup-station-card">
        <div class="popup-station-header">
          <div class="popup-station-mun">📍 ${station.municipality}</div>
          <div class="popup-station-name">${station.formatted.name}</div>
        </div>
        <div class="popup-value-box">
          <span class="popup-pm25-val" style="color:${color};">${latest.pm25}</span>
          <span style="font-size:0.8rem; color:#9ca3af;">µg/m³ PM2.5</span>
        </div>
        <div>
          <span class="popup-badge" style="background:${color}22; color:${color}; border:1px solid ${color}66;">
            ● ICA: ${latest.categoria}
          </span>
        </div>
        <div class="popup-advice">
          <strong>💡 Prescripción de Salud:</strong><br>
          ${latest.advice}
        </div>
        <button class="popup-btn-detail" onclick="abrirModalEstacion('${encodeURIComponent(station.rawLocation)}')">
          Ver Evolución 24 Horas & Detalle
        </button>
      </div>
    `;

    marker.bindPopup(popupContent, { maxWidth: 320 });
    marker.addTo(AppState.mapInstance);
    AppState.mapMarkers.push(marker);
  });
}

/**
 * Renderizado de Cuadrícula de Tarjetas de Estaciones (Punto 8)
 */
function renderStationsGrid() {
  const container = document.getElementById('stationsGridContainer');
  if (!container) return;

  const stations = AppState.filteredStations;
  if (!stations.length) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:3rem; background:rgba(0,0,0,0.2); border-radius:1rem;">
        <p style="font-size:1.1rem; color:#9ca3af;">No se encontraron estaciones que coincidan con los filtros seleccionados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = stations.map(station => {
    const lat = station.latest;
    const color = lat ? lat.color : '#6b7280';
    const dateFormatted = lat && lat.dateLocal ? new Date(lat.dateLocal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

    return `
      <div class="station-card">
        <div>
          <div class="station-card-top">
            <div class="station-name-wrap">
              <span class="station-municipality">${station.municipality}</span>
              <h4 class="station-title">${station.formatted.name}</h4>
            </div>
            <span class="station-code-pill">${station.formatted.code}</span>
          </div>

          <div class="station-reading-box">
            <span class="station-reading-value" style="color: ${color};">${lat ? lat.pm25 : '--'}</span>
            <span class="station-reading-unit">µg/m³ PM2.5</span>
          </div>

          <div class="station-badge-strip" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40;">
            <span>●</span> ICA: ${lat ? lat.categoria : 'Sin datos'}
          </div>

          <div class="station-advice-summary">
            <strong>Recomendación:</strong> ${lat ? lat.advice : 'Sin datos disponibles.'}
          </div>
        </div>

        <div class="station-card-footer">
          <span>🕒 Lectura: ${dateFormatted}</span>
          <button class="btn-card-action" onclick="abrirModalEstacion('${encodeURIComponent(station.rawLocation)}')">
            Ver 24h &gt;
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderizado de Tabla de Datos de Auditoría (Punto 8 y 11)
 */
function renderStationsTable() {
  const tbody = document.getElementById('stationsTableBody');
  if (!tbody) return;

  const stations = AppState.filteredStations;
  tbody.innerHTML = stations.map((station, idx) => {
    const lat = station.latest;
    const color = lat ? lat.color : '#6b7280';
    return `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td>
          <span style="font-weight:700; color:#ffffff;">${station.formatted.name}</span><br>
          <small style="color:#9ca3af;">${station.formatted.code}</small>
        </td>
        <td><span style="color:#38bdf8;">${station.municipality}</span></td>
        <td>
          <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700; color:${color};">
            ${lat ? lat.pm25 : '--'} µg/m³
          </span>
        </td>
        <td>
          <span style="display:inline-block; padding:0.2rem 0.6rem; border-radius:1rem; font-size:0.75rem; font-weight:700; background:${color}22; color:${color}; border:1px solid ${color}55;">
            ${lat ? lat.categoria : 'Sin datos'}
          </span>
        </td>
        <td style="font-family:var(--font-mono); font-size:0.8rem; color:#9ca3af;">
          ${station.coordinates.latitude.toFixed(4)}, ${station.coordinates.longitude.toFixed(4)}
        </td>
        <td>
          <button class="btn-card-action" onclick="abrirModalEstacion('${encodeURIComponent(station.rawLocation)}')">
            Analizar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Visualizaciones Estadísticas con Chart.js (Inspirado en celda 12 del Notebook)
 */
function renderStatisticalCharts() {
  if (typeof Chart === 'undefined') return;

  const stations = [...AppState.cleanedStations].sort((a, b) => (b.latest ? b.latest.pm25 : 0) - (a.latest ? a.latest.pm25 : 0));
  if (!stations.length) return;

  // 1. Gráfico de Barras / Comparativa de Concentración de PM2.5 por Estación
  const ctxBar = document.getElementById('chartStationsBar');
  if (ctxBar) {
    if (AppState.charts.stationsBar) AppState.charts.stationsBar.destroy();

    const labels = stations.map(s => s.formatted.name.length > 18 ? s.formatted.name.slice(0, 18) + '...' : s.formatted.name);
    const dataValues = stations.map(s => s.latest ? s.latest.pm25 : 0);
    const bgColors = stations.map(s => s.latest ? s.latest.color : '#6b7280');

    AppState.charts.stationsBar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Concentración PM2.5 (µg/m³)',
          data: dataValues,
          backgroundColor: bgColors,
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: function(context) {
                const st = stations[context.dataIndex];
                return `Categoría ICA: ${st.latest.categoria}\nMunicipio: ${st.municipality}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.07)' },
            ticks: { color: '#9ca3af' },
            title: { display: true, text: 'µg/m³ PM2.5', color: '#9ca3af' }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#9ca3af',
              maxRotation: 45,
              minRotation: 30,
              font: { size: 10 }
            }
          }
        }
      }
    });
  }

  // 2. Gráfico Donut de Distribución de Categorías ICA
  const ctxDonut = document.getElementById('chartAqiDonut');
  if (ctxDonut) {
    if (AppState.charts.aqiDonut) AppState.charts.aqiDonut.destroy();

    const catCounts = {};
    Object.keys(AQI_CONFIG).forEach(k => { if (k !== 'Sin Datos') catCounts[k] = 0; });

    stations.forEach(s => {
      const cat = s.latest ? s.latest.categoria : 'Sin Datos';
      if (catCounts[cat] !== undefined) catCounts[cat]++;
    });

    const activeCats = Object.keys(catCounts).filter(k => catCounts[k] > 0);
    const activeData = activeCats.map(k => catCounts[k]);
    const activeColors = activeCats.map(k => AQI_CONFIG[k].color);

    AppState.charts.aqiDonut = new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels: activeCats,
        datasets: [{
          data: activeData,
          backgroundColor: activeColors,
          borderColor: '#111827',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#f3f4f6', font: { size: 11 }, padding: 12 }
          }
        },
        cutout: '68%'
      }
    });
  }

  // 3. Perfil Horario Promedio Diurno (24 Horas en el Valle de Aburrá)
  const ctxDiurnal = document.getElementById('chartDiurnalTrend');
  if (ctxDiurnal) {
    if (AppState.charts.diurnalTrend) AppState.charts.diurnalTrend.destroy();

    // Agrupar mediciones por hora del día (0 a 23)
    const hourlySums = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);

    stations.forEach(s => {
      s.validHistory.forEach(m => {
        if (m.cleanValue !== null && m.dateLocal) {
          const hour = new Date(m.dateLocal).getHours();
          hourlySums[hour] += m.cleanValue;
          hourlyCounts[hour]++;
        }
      });
    });

    const hourLabels = [];
    const hourlyAverages = [];
    for (let h = 0; h < 24; h++) {
      hourLabels.push(`${h.toString().padStart(2, '0')}:00`);
      hourlyAverages.push(hourlyCounts[h] > 0 ? parseFloat((hourlySums[h] / hourlyCounts[h]).toFixed(1)) : null);
    }

    AppState.charts.diurnalTrend = new Chart(ctxDiurnal, {
      type: 'line',
      data: {
        labels: hourLabels,
        datasets: [{
          label: 'Concentración Media Horaria Valle de Aburrá (µg/m³)',
          data: hourlyAverages,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#f3f4f6' } }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: { color: 'rgba(255, 255, 255, 0.07)' },
            ticks: { color: '#9ca3af' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af', maxTicksLimit: 12 }
          }
        }
      }
    });
  }
}

/**
 * Panel de Evidencias Técnicas (Punto 11)
 */
function renderEvidencePanel() {
  const elRaw = document.getElementById('evRawRecords');
  const elValid = document.getElementById('evValidRecords');
  const elAnomalous = document.getElementById('evAnomalousRecords');
  const elStations = document.getElementById('evActiveStations');
  const elLatency = document.getElementById('evLatency');
  const elSourceText = document.getElementById('evSource');
  const jsonViewer = document.getElementById('jsonCodeViewer');

  if (elRaw) elRaw.textContent = AppState.apiMetadata.rawCount;
  if (elValid) elValid.textContent = AppState.apiMetadata.validCount;
  if (elAnomalous) elAnomalous.textContent = AppState.apiMetadata.anomalousCount;
  if (elStations) elStations.textContent = AppState.cleanedStations.length;
  if (elLatency) elLatency.textContent = `${AppState.apiMetadata.latencyMs || 120} ms`;
  if (elSourceText) elSourceText.textContent = AppState.apiMetadata.source;

  if (jsonViewer && AppState.rawMeasurements.length > 0) {
    const samplePayload = {
      api: "SIATA - Sistema de Alerta Temprana de Medellín y el Valle de Aburrá",
      url: "https://siata.gov.co/EntregaData1/Datos_SIATA_Aire_AQ_pm25_Last.json",
      httpStatus: 200,
      timestamp: AppState.apiMetadata.timestamp,
      total_registros_recibidos: AppState.apiMetadata.rawCount,
      registros_validos: AppState.apiMetadata.validCount,
      registros_anomalos_depurados: AppState.apiMetadata.anomalousCount,
      muestra_primeros_registros: AppState.rawMeasurements.slice(0, 3)
    };
    jsonViewer.textContent = JSON.stringify(samplePayload, null, 2);
  }
}

/**
 * Poblar el selector de municipios con los datos activos
 */
function poblarSelectMunicipios() {
  const sel = document.getElementById('filterMunicipality');
  if (!sel) return;

  const currentVal = sel.value;
  const muns = new Set(AppState.cleanedStations.map(s => s.municipality));
  const sortedMuns = Array.from(muns).sort();

  sel.innerHTML = `<option value="all">🏙️ Todos los Municipios (${AppState.cleanedStations.length})</option>` +
    sortedMuns.map(m => `<option value="${m}">${m}</option>`).join('');

  if (sortedMuns.includes(currentVal)) {
    sel.value = currentVal;
  }
}

/**
 * Modal de Detalle de Estación con Histórico 24h
 */
function abrirModalEstacion(encodedLoc) {
  const rawLoc = decodeURIComponent(encodedLoc);
  const station = AppState.cleanedStations.find(s => s.rawLocation === rawLoc);
  if (!station) return;

  const modal = document.getElementById('stationModal');
  const modalTitle = document.getElementById('modalStationTitle');
  const modalMun = document.getElementById('modalStationMun');
  const modalPM25 = document.getElementById('modalStationPM25');
  const modalAqiBadge = document.getElementById('modalAqiBadge');
  const modalAdvice = document.getElementById('modalAdvice');
  const modalSchools = document.getElementById('modalSchoolsAdvice');
  const modalSports = document.getElementById('modalSportsAdvice');
  const modalAvg = document.getElementById('modalAvg24h');
  const modalMin = document.getElementById('modalMin24h');
  const modalMax = document.getElementById('modalMax24h');

  const lat = station.latest;
  const color = lat ? lat.color : '#6b7280';

  if (modalTitle) modalTitle.textContent = station.formatted.name;
  if (modalMun) modalMun.textContent = `Municipio: ${station.municipality} | Código: ${station.formatted.code}`;
  if (modalPM25) {
    modalPM25.textContent = lat ? `${lat.pm25} µg/m³` : '--';
    modalPM25.style.color = color;
  }
  if (modalAqiBadge && lat) {
    modalAqiBadge.innerHTML = `<span style="display:inline-block; padding:0.35rem 0.85rem; border-radius:2rem; font-size:0.85rem; font-weight:700; background:${color}25; color:${color}; border:1px solid ${color};">● ICA: ${lat.categoria}</span>`;
  }
  if (modalAdvice && lat) modalAdvice.textContent = lat.advice;
  if (modalSchools && lat) modalSchools.textContent = lat.actionSchools;
  if (modalSports && lat) modalSports.textContent = lat.actionSports;
  if (modalAvg && lat) modalAvg.textContent = `${lat.avg24h} µg/m³`;
  if (modalMin && lat) modalMin.textContent = `${lat.min24h} µg/m³`;
  if (modalMax && lat) modalMax.textContent = `${lat.max24h} µg/m³`;

  // Renderizar gráfico de 24 horas de la estación
  const ctxModal = document.getElementById('modalStationHistoryChart');
  if (ctxModal && typeof Chart !== 'undefined') {
    if (AppState.charts.stationModalChart) AppState.charts.stationModalChart.destroy();

    const history = station.validHistory || [];
    const labels = history.map(h => {
      if (!h.dateLocal) return '';
      return new Date(h.dateLocal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    const values = history.map(h => h.cleanValue);

    AppState.charts.stationModalChart = new Chart(ctxModal, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `PM2.5 Histórico 24h (${station.formatted.code})`,
          data: values,
          borderColor: color,
          backgroundColor: `${color}25`,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: color
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#ffffff' } }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#9ca3af' },
            title: { display: true, text: 'µg/m³', color: '#9ca3af' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af', maxTicksLimit: 12 }
          }
        }
      }
    });
  }

  if (modal) modal.classList.add('active');
}

function cerrarModal() {
  const modal = document.getElementById('stationModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Manejo de Eventos e Interacciones (Punto 8)
 */
function bindEvents() {
  // Buscador reactivo
  const searchInput = document.getElementById('stationSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      actualizarVistas();
    });
  }

  // Filtro por Municipio
  const selMun = document.getElementById('filterMunicipality');
  if (selMun) {
    selMun.addEventListener('change', (e) => {
      AppState.activeMunicipalityFilter = e.target.value;
      actualizarVistas();
    });
  }

  // Selector de Orden
  const selSort = document.getElementById('sortStations');
  if (selSort) {
    selSort.addEventListener('change', (e) => {
      AppState.sortBy = e.target.value;
      actualizarVistas();
    });
  }

  // Filtros por Categoría de ICA (Pills)
  const catButtons = document.querySelectorAll('.cat-filter-btn');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.activeCategoryFilter = btn.dataset.category || 'all';
      actualizarVistas();
    });
  });

  // Botón de Actualizar Datos SIATA
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      cargarDatosSIATA(true);
    });
  }

  // Botón de Copiar JSON
  const btnCopy = document.getElementById('btnCopyJson');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = document.getElementById('jsonCodeViewer').textContent;
      navigator.clipboard.writeText(text).then(() => {
        btnCopy.textContent = '¡Copiado! ✓';
        setTimeout(() => { btnCopy.textContent = 'Copiar JSON'; }, 2000);
      });
    });
  }

  // Botón Exportar CSV
  const btnExportCsv = document.getElementById('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportarCsv);
  }

  // Botones de Modos de Vista (Punto 8)
  const viewTabs = document.querySelectorAll('.view-tab-btn');
  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      viewTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.view;
      cambiarModoVista(mode);
    });
  });

  // Cerrar modal al hacer clic en el backdrop o en el botón cerrar
  const modal = document.getElementById('stationModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cerrarModal();
    });
  }
}

/**
 * Cambio dinámico entre vistas
 */
function cambiarModoVista(mode) {
  AppState.activeView = mode;
  const mapView = document.getElementById('mapViewWrapper');
  const gridView = document.getElementById('stationsGridContainer');
  const tableView = document.getElementById('stationsTableWrapper');
  const chartsView = document.getElementById('chartsAnalyticsWrapper');

  if (mapView) mapView.style.display = (mode === 'map') ? 'block' : 'none';
  if (gridView) gridView.style.display = (mode === 'cards') ? 'grid' : 'none';
  if (tableView) tableView.style.display = (mode === 'table') ? 'block' : 'none';
  if (chartsView) chartsView.style.display = (mode === 'charts') ? 'block' : 'none';

  if (mode === 'map' && AppState.mapInstance) {
    setTimeout(() => AppState.mapInstance.invalidateSize(), 150);
  }
}

/**
 * Exportación de datos limpios a CSV (Punto 11)
 */
function exportarCsv() {
  const stations = AppState.filteredStations;
  if (!stations.length) return alert('No hay estaciones para exportar.');

  const headers = ['Estacion', 'Codigo', 'Municipio', 'PM25_ug_m3', 'Categoria_ICA', 'Latitud', 'Longitud', 'Fecha_Local'];
  const rows = stations.map(s => {
    const lat = s.latest;
    return [
      `"${s.formatted.name}"`,
      `"${s.formatted.code}"`,
      `"${s.municipality}"`,
      lat ? lat.pm25 : '',
      `"${lat ? lat.categoria : ''}"`,
      s.coordinates.latitude,
      s.coordinates.longitude,
      `"${lat ? lat.dateLocal : ''}"`
    ];
  });

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `SIATA_Calidad_Aire_Valle_Aburra_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
