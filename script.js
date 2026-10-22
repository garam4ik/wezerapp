const OBLASTS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/regiony.geojson";
const RAIONS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/rayony.geojson";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CODES = {
  0: "Ясно", 1: "Переважно ясно", 2: "Мінлива хмарність", 3: "Хмарно",
  45: "Туман", 48: "Туман", 51: "Мряка", 53: "Мряка", 55: "Сильна мряка",
  56: "Крижана мряка", 57: "Крижана мряка", 61: "Невеликий дощ", 63: "Дощ", 65: "Сильний дощ",
  66: "Крижаний дощ", 67: "Крижаний дощ", 71: "Невеликий сніг", 73: "Сніг", 75: "Сильний сніг",
  77: "Снігові зерна", 80: "Короткочасний дощ", 81: "Зливи", 82: "Сильні зливи", 85: "Снігові заряди",
  86: "Сильні снігові заряди", 95: "Гроза", 96: "Гроза з градом", 99: "Сильна гроза з градом"
};
let map;
let oblastFeatures = [];
let districtLayers = [];
let selectedOblast = null;
let hoveredDistrict = null;
let selectedDistrict = null;
let hoverRequestId = 0;
const weatherCache = new Map();
const pendingWeather = new Map();
const nameByFeature = new WeakMap();

function propsOf(feature) { return feature && feature.properties ? feature.properties : {}; }
function normalize(value) {
  return String(value || "").toLocaleLowerCase("uk-UA")
    .replace(/[’'`]/g, "").replace(/[^a-zа-яіїєґ0-9]/g, "");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}
function getName(feature, kind = "district") {
  if (nameByFeature.has(feature)) return nameByFeature.get(feature);
  const p = propsOf(feature);
  const preferred = kind === "oblast"
    ? [p.name_uk, p.NAME_1, p.name, p.NAME, p.shapeName, p.region_name, p.oblast_name, p.admin1Name, p.NAME_UK]
    : [p.name_uk, p.raion_name, p.raionName, p.admin2Name, p.NAME_2, p.NAME_3, p.name_2, p.name_3, p.shapeName, p.NAME_UK, p.name, p.NAME, p.name_1];
  let result = preferred.find(value => typeof value === "string" && value.trim());
  if (!result) {
    const keyPatterns = kind === "oblast" ? /oblast|region|admin1|name/i : /raion|district|admin2|name|shape/i;
    result = Object.entries(p).find(([key, value]) => keyPatterns.test(key) && typeof value === "string" && value.trim() && !/^ukraine$/i.test(value.trim()))?.[1];
  }
  if (!result) result = Object.values(p).find(value => typeof value === "string" && value.trim() && !/^ukraine$/i.test(value.trim()));
  const name = result ? String(result).trim() : (kind === "oblast" ? "Область" : "Район без назви");
  nameByFeature.set(feature, name);
  return name;
}
function centerOf(feature) {
  try {
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) { const c = bounds.getCenter(); return [c.lat, c.lng]; }
  } catch (_) {}
  return null;
}
function weatherKey(feature) {
  const center = centerOf(feature);
  return center ? `${center[0].toFixed(3)},${center[1].toFixed(3)}` : normalize(getName(feature));
}
function pointInRing(point, ring) {
  const x = point[1], y = point[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const crosses = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, coordinates) {
  if (!coordinates || !coordinates.length || !pointInRing(point, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i++) if (pointInRing(point, coordinates[i])) return false;
  return true;
}
function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(poly => pointInPolygon(point, poly));
  return false;
}
function findOblastForDistrict(feature) {
  const center = centerOf(feature);
  if (!center) return null;
  return oblastFeatures.find(oblast => pointInGeometry(center, oblast.geometry)) || null;
}
function sameOblast(a, b) { return a && b && a === b; }
function baseDistrictStyle() { return { color: "#fff", weight: 0.85, opacity: 0.92, fillColor: "#000", fillOpacity: 0.001 }; }
function activeDistrictStyle() { return { color: "#fff", weight: 2.5, opacity: 1, fillColor: "#fff", fillOpacity: 0.08 }; }
function oblastStyle() { return { color: "#fff", weight: 1.8, opacity: 1, fill: false, interactive: true }; }
function restoreDistrictStyles() {
  districtLayers.forEach(item => item.layer.setStyle(item.feature === selectedDistrict || item.feature === hoveredDistrict ? activeDistrictStyle() : baseDistrictStyle()));
}
function districtItem(layer) { return districtLayers.find(item => item.layer === layer); }
function tooltipHtml(name, weather) {
  return `<strong>${escapeHtml(name)}</strong><br><span class="tooltip-weather">${weather}</span>`;
}
const sharedTooltip = () => L.tooltip({ sticky: false, direction: "top", opacity: 1, className: "district-weather-tooltip", offset: [0, -8], permanent: false });
let tooltip;
function showTooltip(latlng, name, weather) {
  if (!tooltip) tooltip = sharedTooltip();
  tooltip.setLatLng(latlng).setContent(tooltipHtml(name, weather));
  if (!map.hasLayer(tooltip)) tooltip.addTo(map);
}
function hideTooltip() { if (tooltip && map && map.hasLayer(tooltip)) map.removeLayer(tooltip); }
async function loadWeather(feature) {
  const key = weatherKey(feature);
  if (weatherCache.has(key)) return weatherCache.get(key);
  if (!pendingWeather.has(key)) {
    const center = centerOf(feature);
    if (!center) return "Погода: невідомо";
    const params = new URLSearchParams({
      latitude: String(center[0]), longitude: String(center[1]),
      current: "temperature_2m,weather_code,wind_speed_10m", timezone: "Europe/Kyiv"
    });
    const request = fetch(`${WEATHER_URL}?${params}`).then(response => {
      if (!response.ok) throw new Error("Weather unavailable");
      return response.json();
    }).then(data => {
      const current = data.current;
      if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("No weather");
      const condition = WEATHER_CODES[current.weather_code] || "невідомо";
      return `${escapeHtml(condition)} · ${Math.round(current.temperature_2m)}°C<br>Вітер: ${Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) + " км/год" : "невідомо"}`;
    }).catch(() => "Погода: невідомо").then(result => { weatherCache.set(key, result); pendingWeather.delete(key); return result; });
    pendingWeather.set(key, request);
  }
  return pendingWeather.get(key);
}
async function onDistrictHover(item, event) {
  if (!selectedOblast || !sameOblast(item.oblast, selectedOblast)) return;
  hoveredDistrict = item.feature;
  restoreDistrictStyles();
  const id = ++hoverRequestId;
  const name = getName(item.feature);
  showTooltip(event.latlng, name, "Завантажуємо погоду…");
  const weather = await loadWeather(item.feature);
  if (id !== hoverRequestId || hoveredDistrict !== item.feature || !selectedOblast || !sameOblast(item.oblast, selectedOblast)) return;
  if (tooltip) tooltip.setContent(tooltipHtml(name, weather));
}
function selectOblast(feature) {
  selectedOblast = feature;
  selectedDistrict = null;
  hoveredDistrict = null;
  hoverRequestId++;
  hideTooltip();
  restoreDistrictStyles();
  // Region selection is intentionally quiet; only districts within it can show hover tooltips.
}
function bindDistrict(feature, layer) {
  const item = { feature, layer, oblast: null };
  districtLayers.push(item);
  layer.on({
    mouseover: event => {
      if (item.oblast && selectedOblast && sameOblast(item.oblast, selectedOblast)) onDistrictHover(item, event);
    },
    mousemove: event => {
      if (hoveredDistrict === feature && tooltip) tooltip.setLatLng(event.latlng);
    },
    mouseout: () => {
      // A clicked district keeps its single tooltip open; leaving it must not cancel its weather request.
      if (selectedDistrict === feature) return;
      if (hoveredDistrict === feature) {
        hoveredDistrict = null;
        hoverRequestId++;
        hideTooltip();
        restoreDistrictStyles();
      }
    },
    click: event => {
      if (!item.oblast) return;
      if (!sameOblast(selectedOblast, item.oblast)) selectOblast(item.oblast);
      selectedDistrict = feature;
      hoveredDistrict = feature;
      restoreDistrictStyles();
      const id = ++hoverRequestId;
      const name = getName(feature);
      showTooltip(event.latlng, name, "Завантажуємо погоду…");
      loadWeather(feature).then(weather => {
        if (id === hoverRequestId && selectedDistrict === feature) showTooltip(event.latlng, name, weather);
      });
    }
  });
}
function bindOblast(feature, layer) {
  layer.on({
    click: event => {
      selectOblast(feature);
      // Clicking the region outline selects it; the district borders remain available for picking.
      if (event.originalEvent) event.originalEvent.preventDefault();
    }
  });
}
async function init() {
  map = L.map("map", { zoomControl: false, attributionControl: false, scrollWheelZoom: true, doubleClickZoom: true, preferCanvas: false }).setView([48.8, 31.2], 6);
  tooltip = sharedTooltip();
  try {
    const [oblastResponse, raionResponse] = await Promise.all([fetch(OBLASTS_URL), fetch(RAIONS_URL)]);
    if (!oblastResponse.ok || !raionResponse.ok) throw new Error("GeoJSON request failed");
    const [oblasts, raions] = await Promise.all([oblastResponse.json(), raionResponse.json()]);
    oblastFeatures = oblasts.features || [];
    const districtLayer = L.geoJSON(raions, { style: baseDistrictStyle, onEachFeature: bindDistrict }).addTo(map);
    // Match each district to the oblast containing its geographic center. This avoids relying on inconsistent property names.
    districtLayers.forEach(item => { item.oblast = findOblastForDistrict(item.feature); });
    L.geoJSON(oblasts, { style: oblastStyle, onEachFeature: bindOblast, pane: "overlayPane" }).addTo(map);
    const bounds = districtLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [10, 10] });
    else map.setView([48.8, 31.2], 6);
    setTimeout(() => map.invalidateSize(), 80);
  } catch (error) {
    console.error("Map boundary loading failed:", error);
    const loading = document.getElementById("map-loading");
    loading.textContent = "Не вдалося завантажити межі. Перевір інтернет-з’єднання.";
    return;
  }
  document.getElementById("map-loading").hidden = true;
}
window.addEventListener("load", () => {
  if (typeof L === "undefined") {
    document.getElementById("map-loading").textContent = "Не вдалося завантажити карту.";
    return;
  }
  init();
});
