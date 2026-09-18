# Walkthrough: Sistema Inteligente de Calidad del Aire (SIATA) & Landing Page de Toma de Decisiones

Se ha desarrollado y desplegado con éxito la plataforma web interactiva **AeroSIATA Valle de Aburrá**, construida estrictamente a partir de la lógica, algoritmos y visualizaciones del notebook [`analisis_calidad_aire_siata.ipynb`](file:///C:/Users/EQUIPO/Downloads/analisis_calidad_aire_siata.ipynb).

---

## 📌 Resumen de Cumplimiento de Requisitos

### Punto 6: Consumo de Datos SIATA y Consulta del ICA
- **Consumo en Tiempo Real:** Implementación en [`server.js`](file:///c:/Users/EQUIPO/.gemini/antigravity-ide/scratch/nutrifrutas-web/server.js) de un proxy backend que consume el endpoint oficial de SIATA:  
  `https://siata.gov.co/EntregaData1/Datos_SIATA_Aire_AQ_pm25_Last.json`
- **Depuración de Datos:** Detección y descarte del valor centinela `-9999` (inconsistencia identificada en la celda 8 y 10 del notebook), aislando mediciones no válidas sin sesgar el análisis.
- **Clasificación Oficial del ICA:** Aplicación de la regla de clasificación según la concentración de PM2.5 ($\mu g/m^3$):
  - **Buena:** $\le 12.0$ (Verde `#10b981`)
  - **Moderada:** $12.1 - 35.4$ (Amarillo `#f59e0b`)
  - **Dañina para grupos sensibles:** $35.5 - 55.4$ (Naranja `#f97316`)
  - **Dañina:** $55.5 - 150.4$ (Rojo `#ef4444`)
  - **Muy dañina:** $150.5 - 250.4$ (Púrpura `#8b5cf6`)
  - **Peligrosa:** $> 250.4$ (Borgoña `#881337`)
- **Motor Prescriptivo:** Generación automática de recomendaciones sanitarias para cada nivel de alerta.

---

### Punto 7: Componente de Mapeo Geoespacial
- **Integración con Leaflet.js:** Mapa interactivo centrado en el Valle de Aburrá `[6.2442, -75.5812]` en [`js/app.js`](file:///c:/Users/EQUIPO/.gemini/antigravity-ide/scratch/nutrifrutas-web/js/app.js).
- **Capa Oficial:** Utiliza la misma capa del notebook: **Esri World Street Map** (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}`) y opción de alternar a CartoDB Dark.
- **Marcadores Cromáticos Dinámicos:** Círculos estilizados con el color correspondiente al semáforo ICA de cada estación.
- **Popups Enriquecidos:** Al hacer clic en cualquier estación se despliega:
  - Nombre y municipio de la estación.
  - Valor exacto de PM2.5 en $\mu g/m^3$ con badge de color.
  - Recomendación sanitaria y directriz de salud.
  - Botón directo para abrir el modal con el histórico horario de 24 horas.

---

### Punto 8: Interacción Avanzada en la Aplicación
- **Buscador en Tiempo Real:** Búsqueda instantánea por nombre de estación, código técnico o municipio (ej. *Centro, Itagüí, Caldas, Girardota*).
- **Filtro por Categoría ICA:** Botones rápidos de semáforo para aislar estaciones en estado *Buena, Moderada, Grupos Sensibles o Dañina*.
- **Filtro por Municipio:** Menú desplegable poblado dinámicamente con los municipios del área metropolitana.
- **Ordenamiento:** Ordenar por mayor contaminación (PM2.5 descendente), menor contaminación o alfabético.
- **Selector Multivista:**
  - 🗺️ **Vista Mapa:** Mapeo satelital y urbano a pantalla ancha.
  - 🎴 **Vista Tarjetas:** Mosaico de tarjetas con semáforo, valor numérico y recomendaciones.
  - 📋 **Vista Tabla:** Tabla de auditoría técnica con coordenadas y exportación de datos.
  - 📊 **Vista Analítica:** Gráficos estadísticos interactivos.
- **Modal de Detalle:** Inspección individual con velocímetro de ICA, comparativa con la norma de la OMS (15 $\mu g/m^3$) y norma colombiana (37 $\mu g/m^3$), y curva de evolución horaria de 24 horas con Chart.js.

---

### Puntos 9 y 10: Landing Page con Situación Real y Toma de Decisiones
Se estructuró una Landing Page de alto impacto visual y rigor conceptual:
- **Situación Real Planteada:**  
  *"Respira Seguro Valle de Aburrá: Sistema Inteligente de Apoyo a Decisiones Escolares, Deportivas y de Salud Pública ante Fenómenos de Inversión Térmica"*.
- **Explicación de los 6 Ejes Clave:**
  1. **El Problema:** La topografía de cañón cerrado del Valle de Aburrá y el fenómeno de inversión térmica atrapan las partículas finas PM2.5 emitidas por vehículos e industrias, provocando crisis respiratorias severas y hospitalizaciones infantiles.
  2. **El Contexto:** Medellín y 9 municipios conurbados con más de 3.8 millones de habitantes y 300,000 escolares expuestos en horas pico.
  3. **Datos Utilizados:** Dataset abierto de SIATA con 525 mediciones, tratamiento de centinelas `-9999`, geolocalización satelital WGS84 y estampas de tiempo normalizadas.
  4. **Funcionamiento de la Solución:** Flujo de 5 fases (Adquisición -> Limpieza -> Clasificación ICA -> Motor Prescriptivo -> Visualizaciones Reactivas).
  5. **Visualizaciones:** Mapa de calor/marcadores Leaflet, gráfico comparativo de barras estilo Seaborn del notebook con líneas de umbral crítico (35.4 y 55.4 $\mu g/m^3$), gráfico de dona de proporciones ICA y curva horaria diurna.
  6. **Utilidad para la Toma de Decisiones:**
     - **Colegios:** Decisión objetiva de suspender educación física y recreos en patios abiertos si la estación local supera los 35.4 $\mu g/m^3$.
     - **Deportistas/Ciclistas:** Selección de horarios vespertinos y rutas seguras para evitar la inhalación intensiva de aerosoles tóxicos.
     - **Hospitales:** Alerta anticipada de 48h para disponibilidad de oxígeno, nebulizadores y camas pediátricas por IRA.
     - **Gobierno y Tránsito:** Sustento técnico para la activación focalizada de medidas de contingencia ambiental (Pico y Placa Ambiental).

---

### Punto 11: Evidencias Técnicas del Funcionamiento
Se construyó una sección de auditoría en la landing page ([#evidencias](http://localhost:8000/#evidencias)):
- **Consumo de API Verificado:** Status HTTP 200, latencia de respuesta en milisegundos, timestamp oficial y conexión directa a la API de SIATA.
- **Tratamiento de Datos Auditable:**
  - Total registros brutos recibidos: **525**
  - Registros centinela `-9999` descartados: **138**
  - Registros válidos procesados: **387**
  - Estaciones únicas georreferenciadas: **16**
- **Visor Interactivo de JSON:** Muestra del payload formateado con botón de copiado en un clic.
- **Exportación de Datos:** Botón para descargar el dataset depurado directamente en formato **CSV**.

---

## 🚀 Cómo Iniciar y Probar Ambas Aplicaciones

Ambas aplicaciones están completamente separadas y funcionando en paralelo en puertos distintos sin conflicto:

### 1. 🌫️ AeroSIATA - Calidad del Aire (Puntos 6 al 11)
- **Directorio:** `c:\Users\EQUIPO\.gemini\antigravity-ide\scratch\siata-calidad-aire`
- **URL de la Aplicación:** [http://localhost:8080](http://localhost:8080)
- **Endpoint API Proxy SIATA:** [http://localhost:8080/api/siata](http://localhost:8080/api/siata)
- **Health Check:** [http://localhost:8080/health](http://localhost:8080/health)
- **Launcher de 1 clic:** [`siata-calidad-aire\iniciar.bat`](file:///c:/Users/EQUIPO/.gemini/antigravity-ide/scratch/siata-calidad-aire/iniciar.bat)

---

### 2. 🍓 NutriFrutas Pro (Aplicación Original)
- **Directorio:** `c:\Users\EQUIPO\.gemini\antigravity-ide\scratch\nutrifrutas-web`
- **URL de la Aplicación:** [http://localhost:8000](http://localhost:8000)
- **Launcher de 1 clic:** [`nutrifrutas-web\iniciar.bat`](file:///c:/Users/EQUIPO/.gemini/antigravity-ide/scratch/nutrifrutas-web/iniciar.bat)

