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
let selectedLayer = null;
const weatherCache = new Map();
const pendingWeather = new Map();

function propsOf(feature) { return feature && feature.properties ? feature.properties : {}; }
function normalize(value) {
  return String(value || "").toLocaleLowerCase("uk-UA")
    .replace(/[’'`]/g, "").replace(/[^a-zа-яіїєґ0-9]/g, "");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}
function getName(feature, kind = "district") {
  const p = propsOf(feature);
  const preferred = kind === "oblast"
    ? [p.name_uk, p.NAME_1, p.name, p.NAME, p.shapeName, p.region_name, p.oblast_name, p.admin1Name, p.NAME_UK]
    : [p.name_uk, p.raion_name, p.raionName, p.admin2Name, p.NAME_2, p.NAME_3, p.name_2, p.name_3, p.shapeName, p.NAME_UK, p.name, p.NAME, p.name_1];
  for (const value of preferred) if (typeof value === "string" && value.trim()) return value.trim();
  // GeoJSON sources use different schemas. Search remaining property names rather than showing “unknown district”.
  const entries = Object.entries(p);
  const keyPatterns = kind === "oblast" ? /oblast|region|admin1|name/i : /raion|district|admin2|name|shape/i;
  for (const [key, value] of entries) {
    if (keyPatterns.test(key) && typeof value === "string" && value.trim() && !/^ukraine$/i.test(value.trim())) return value.trim();
  }
  for (const value of Object.values(p)) {
    if (typeof value === "string" && value.trim() && !/^ukraine$/i.test(value.trim())) return value.trim();
  }
  return kind === "oblast" ? "Область" : "Район без назви";
}
function centerOf(feature) {
  try {
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      const center = bounds.getCenter();
      return [center.lat, center.lng];
    }
  } catch (_) {}
  return null;
}
function weatherKey(feature) {
  const center = centerOf(feature);
  return center ? `${center[0].toFixed(3)},${center[1].toFixed(3)}` : normalize(getName(feature));
}
function bindInitialTooltip(feature, layer) {
  const name = getName(feature);
  layer.bindTooltip(`${escapeHtml(name)}<br><span class="tooltip-weather">Погода: наведіть курсор…</span>`, {
    sticky: true, direction: "top", opacity: 1, className: "district-weather-tooltip"
  });
  layer.on({
    mouseover: event => {
      const target = event.target;
      if (selectedLayer && selectedLayer !== target) selectedLayer.setStyle(districtStyle());
      target.setStyle({ color: "#fff", weight: 2.8, opacity: 1, fillColor: "#000", fillOpacity: 0.01 });
      target.bringToFront();
      loadWeatherTooltip(feature, target);
    },
    mouseout: event => {
      if (event.target !== selectedLayer) event.target.setStyle(districtStyle());
    },
    click: event => {
      if (selectedLayer && selectedLayer !== event.target) selectedLayer.setStyle(districtStyle());
      selectedLayer = event.target;
      selectedLayer.setStyle({ color: "#fff", weight: 3, opacity: 1, fillColor: "#000", fillOpacity: 0.02 });
      selectedLayer.openTooltip();
      loadWeatherTooltip(feature, selectedLayer, true);
    }
  });
}
function districtStyle() { return { color: "#fff", weight: 0.85, opacity: 0.92, fillColor: "#000", fillOpacity: 0.001 }; }
function oblastStyle() { return { color: "#fff", weight: 1.65, opacity: 1, fillColor: "#000", fillOpacity: 0.001, interactive: false }; }
async function loadWeatherTooltip(feature, layer, selected = false) {
  const name = getName(feature);
  const center = centerOf(feature);
  const key = weatherKey(feature);
  const show = text => {
    const html = `${escapeHtml(name)}<br><span class="tooltip-weather">${text}</span>`;
    layer.setTooltipContent(html);
    if (selected) layer.openTooltip();
  };
  if (weatherCache.has(key)) { show(weatherCache.get(key)); return; }
  if (!center) { weatherCache.set(key, "Погода: невідомо"); show("Погода: невідомо"); return; }
  show("Завантажуємо погоду…");
  if (!pendingWeather.has(key)) {
    const params = new URLSearchParams({
      latitude: String(center[0]), longitude: String(center[1]),
      current: "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,precipitation",
      timezone: "Europe/Kyiv"
    });
    pendingWeather.set(key, fetch(`${WEATHER_URL}?${params}`).then(response => {
      if (!response.ok) throw new Error("Weather unavailable");
      return response.json();
    }).then(data => {
      const current = data.current;
      if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("No weather");
      const condition = WEATHER_CODES[current.weather_code] || "невідомо";
      return `${escapeHtml(condition)} · ${Math.round(current.temperature_2m)}°C<br>Вітер: ${Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) + " км/год" : "невідомо"}`;
    }).catch(() => "Погода: невідомо").then(result => { weatherCache.set(key, result); pendingWeather.delete(key); return result; }));
  }
  const result = await pendingWeather.get(key);
  show(result);
}
function hideLoading() { document.getElementById("map-loading").hidden = true; }
async function init() {
  map = L.map("map", { zoomControl: false, attributionControl: false, scrollWheelZoom: true, doubleClickZoom: true, preferCanvas: false }).setView([48.8, 31.2], 6);
  try {
    const [oblastResponse, raionResponse] = await Promise.all([fetch(OBLASTS_URL), fetch(RAIONS_URL)]);
    if (!oblastResponse.ok || !raionResponse.ok) throw new Error("GeoJSON request failed");
    const [oblasts, raions] = await Promise.all([oblastResponse.json(), raionResponse.json()]);
    // No raster tiles are added: the background stays pure black.
    L.geoJSON(oblasts, { style: oblastStyle, interactive: false }).addTo(map);
    const districtLayer = L.geoJSON(raions, { style: districtStyle, onEachFeature: bindInitialTooltip }).addTo(map);
    const bounds = districtLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [10, 10] });
    else map.setView([48.8, 31.2], 6);
    setTimeout(() => map.invalidateSize(), 80);
  } catch (error) {
    console.error("Map boundary loading failed:", error);
    const loading = document.getElementById("map-loading");
    loading.textContent = "Не вдалося завантажити межі. Перевір інтернет-з’єднання.";
  } finally {
    hideLoading();
  }
}
window.addEventListener("load", () => {
  if (typeof L === "undefined") {
    document.getElementById("map-loading").textContent = "Не вдалося завантажити карту.";
    return;
  }
  init();
});
