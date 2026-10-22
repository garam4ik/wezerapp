const $ = (id) => document.getElementById(id);

// Доступні джерела GeoJSON. Межі районів відображаються окремим неклікабельним шаром.
const OBLASTS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/regiony.geojson";
const RAIONS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/rayony.geojson";
const HIERARCHICAL_GEO_URL = "https://cdn.jsdelivr.net/gh/darmat1/ukraine-geo-data@main/geodata/";

const WEATHER_CODES = {
  0: ["Ясно", "☀️"], 1: ["Переважно ясно", "🌤️"], 2: ["Мінлива хмарність", "⛅"], 3: ["Хмарно", "☁️"],
  45: ["Туман", "🌫️"], 48: ["Туман", "🌫️"], 51: ["Мряка", "🌦️"], 53: ["Мряка", "🌦️"],
  55: ["Сильна мряка", "🌧️"], 56: ["Крижана мряка", "🌧️"], 57: ["Крижана мряка", "🌧️"],
  61: ["Невеликий дощ", "🌦️"], 63: ["Дощ", "🌧️"], 65: ["Сильний дощ", "🌧️"],
  66: ["Крижаний дощ", "🌧️"], 67: ["Крижаний дощ", "🌧️"], 71: ["Невеликий сніг", "🌨️"],
  73: ["Сніг", "🌨️"], 75: ["Сильний сніг", "❄️"], 77: ["Снігові зерна", "🌨️"],
  80: ["Короткочасний дощ", "🌦️"], 81: ["Зливи", "🌧️"], 82: ["Сильні зливи", "🌧️"],
  85: ["Снігові заряди", "🌨️"], 86: ["Сильні снігові заряди", "❄️"],
  95: ["Гроза", "⛈️"], 96: ["Гроза з градом", "⛈️"], 99: ["Сильна гроза з градом", "⛈️"]
};

// Ключі відповідають slug у hierarchical GeoJSON.
const OBLAST_SLUGS = {
  "Вінницька область": "vinnytska_oblast", "Вінницька": "vinnytska_oblast",
  "Волинська область": "volynska_oblast", "Волинська": "volynska_oblast",
  "Дніпропетровська область": "dnipropetrovska_oblast", "Дніпропетровська": "dnipropetrovska_oblast",
  "Донецька область": "donetska_oblast", "Донецька": "donetska_oblast",
  "Житомирська область": "zhytomyrska_oblast", "Житомирська": "zhytomyrska_oblast",
  "Закарпатська область": "zakarpatska_oblast", "Закарпатська": "zakarpatska_oblast",
  "Запорізька область": "zaporizka_oblast", "Запорізька": "zaporizka_oblast",
  "Івано-Франківська область": "ivano-frankivska_oblast", "Івано-Франківська": "ivano-frankivska_oblast",
  "Київська область": "kyivska_oblast", "Київська": "kyivska_oblast",
  "Кіровоградська область": "kirovohradska_oblast", "Кіровоградська": "kirovohradska_oblast",
  "Луганська область": "luhanska_oblast", "Луганська": "luhanska_oblast",
  "Львівська область": "lvivska_oblast", "Львівська": "lvivska_oblast",
  "Миколаївська область": "mykolaivska_oblast", "Миколаївська": "mykolaivska_oblast",
  "Одеська область": "odeska_oblast", "Одеська": "odeska_oblast",
  "Полтавська область": "poltavska_oblast", "Полтавська": "poltavska_oblast",
  "Рівненська область": "rivnenska_oblast", "Рівненська": "rivnenska_oblast",
  "Сумська область": "sumska_oblast", "Сумська": "sumska_oblast",
  "Тернопільська область": "ternopilska_oblast", "Тернопільська": "ternopilska_oblast",
  "Харківська область": "kharkivska_oblast", "Харківська": "kharkivska_oblast",
  "Херсонська область": "khersonska_oblast", "Херсонська": "khersonska_oblast",
  "Хмельницька область": "khmelnytska_oblast", "Хмельницька": "khmelnytska_oblast",
  "Черкаська область": "cherkaska_oblast", "Черкаська": "cherkaska_oblast",
  "Чернівецька область": "chernivetska_oblast", "Чернівецька": "chernivetska_oblast",
  "Чернігівська область": "chernihivska_oblast", "Чернігівська": "chernihivska_oblast"
};

let map, oblastLayer, raionOutlineLayer, oblastLabelsLayer, districtPopup;
let activeOblast = null;
let selectedRaion = null;
let districtRequestId = 0;
const oblastWeatherCache = new Map();
const raionWeatherCache = new Map();
const raionWeatherPending = new Map();

function normalize(s) {
  return String(s || "").toLocaleLowerCase("uk-UA")
    .replace(/область|обл\.?/g, "").replace(/[’'`]/g, "")
    .replace(/[^a-zа-яіїєґ0-9]/g, "");
}

function propsOf(feature) { return feature && feature.properties ? feature.properties : {}; }

function featureName(feature) {
  const p = propsOf(feature);
  const vals = [p.name, p.NAME_1, p.NAME_2, p.NAME, p.shapeName, p.NAME_UK, p.name_uk, p.admin2Name, p.admin1Name, p.region, p.raion, p.raion_name];
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "Невідомо";
}

function raionFeatureName(feature) {
  const p = propsOf(feature);
  const vals = [p.name, p.name_uk, p.raion_name, p.raionName, p.admin2Name, p.NAME_2, p.NAME_3, p.shapeName, p.NAME_UK, p.name_2, p.NAME_1, p.name_1];
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "Невідомий район";
}

function raionOblastName(feature) {
  const p = propsOf(feature);
  const vals = [p.oblast, p.oblast_name, p.region, p.region_name, p.admin1Name, p.NAME_1, p.name_1, p.NAME_0];
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return displayOblastName(v.trim());
  }
  return "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function displayOblastName(name) {
  const n = String(name || "").trim();
  return n.endsWith(" область") || ["Київ", "Севастополь"].includes(n) ? n : `${n} область`;
}

function findOblastSlug(name) {
  const direct = OBLAST_SLUGS[name];
  if (direct) return direct;
  const norm = normalize(name);
  const match = Object.entries(OBLAST_SLUGS).find(([key]) => normalize(key) === norm);
  return match ? match[1] : null;
}

function featureStyle() {
  return { color: "#7f96b8", weight: 1.05, opacity: 0.9, fillColor: "#17263a", fillOpacity: 0.52 };
}
function oblastStyle() {
  return { color: "#8aa5c8", weight: 1.6, opacity: 1, fillColor: "#1a2b42", fillOpacity: 0.15 };
}

function hideLoading() { $("map-loading").hidden = true; }
function closeDistrictPopup() { if (map && districtPopup) map.closePopup(districtPopup); }

function setUnknown(place, message = "Погодні дані недоступні.") {
  $("selected-region").textContent = place || "Невідомо";
  $("weather-icon").textContent = "❔";
  $("weather-condition").textContent = "невідомо";
  $("temperature").textContent = "невідомо";
  $("feels-like").textContent = "невідомо";
  $("humidity").textContent = "невідомо";
  $("wind").textContent = "невідомо";
  $("precipitation").textContent = "невідомо";
  $("cloud-cover").textContent = "невідомо";
  $("updated-at").textContent = "Оновлено: невідомо";
  $("data-note").textContent = message;
}

function openOblastMenu(feature, layer) {
  activeOblast = { feature, layer, name: featureName(feature) };
  const center = geometryCenter(feature);
  const content = document.createElement("div");
  content.className = "district-popover";
  content.innerHTML = `<div class="district-popover-head"><strong></strong><button type="button" class="popup-close" aria-label="Закрити">×</button></div><p class="district-popover-subtitle">Обери район</p><div class="district-list popup-district-list"><p class="muted">Завантажуємо райони…</p></div>`;
  content.querySelector("strong").textContent = displayOblastName(activeOblast.name);
  content.querySelector(".popup-close").addEventListener("click", closeDistrictPopup);
  districtPopup = L.popup({ closeButton: false, autoPan: true, maxWidth: 330, minWidth: 250, className: "district-leaflet-popup" })
    .setLatLng(center || layer.getBounds().getCenter())
    .setContent(content)
    .openOn(map);
  loadDistricts(activeOblast.name, content.querySelector(".popup-district-list"));
}

async function loadOblastWeather(feature, layer) {
  const name = displayOblastName(featureName(feature));
  const center = geometryCenter(feature);
  if (!center) {
    layer.setTooltipContent(`${name}<br><span class="tooltip-weather">Погода: невідомо</span>`);
    return;
  }
  const cacheKey = name;
  if (oblastWeatherCache.has(cacheKey)) {
    layer.setTooltipContent(oblastWeatherCache.get(cacheKey));
    return;
  }
  layer.setTooltipContent(`${name}<br><span class="tooltip-weather">Завантажуємо погоду…</span>`);
  try {
    const params = new URLSearchParams({ latitude: center[0], longitude: center[1], current: "temperature_2m,weather_code,wind_speed_10m", timezone: "Europe/Kyiv" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Weather unavailable");
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("No current weather");
    const [condition, icon] = WEATHER_CODES[current.weather_code] || ["невідомо", "❔"];
    const html = `${name}<br><span class="tooltip-weather">${icon} ${condition} · ${Math.round(current.temperature_2m)}°C<br>Вітер: ${Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) + " км/год" : "невідомо"}</span>`;
    oblastWeatherCache.set(cacheKey, html);
    layer.setTooltipContent(html);
  } catch (_) {
    const html = `${name}<br><span class="tooltip-weather">Погода: невідомо</span>`;
    oblastWeatherCache.set(cacheKey, html);
    layer.setTooltipContent(html);
  }
}

async function loadRaionTooltipWeather(feature, layer) {
  const name = raionFeatureName(feature);
  const oblast = raionOblastName(feature);
  const center = getRaionCenter(feature);
  const cacheKey = `${normalize(oblast)}:${normalize(name)}`;
  const tooltipHtml = (weather) => `${escapeHtml(name)}${oblast ? `<br><span class="tooltip-oblast">${escapeHtml(oblast)}</span>` : ""}<br><span class="tooltip-weather">${weather}</span>`;

  if (raionWeatherCache.has(cacheKey)) {
    layer.setTooltipContent(tooltipHtml(raionWeatherCache.get(cacheKey)));
    return;
  }
  layer.setTooltipContent(tooltipHtml("Завантажуємо погоду…"));
  if (!center) {
    raionWeatherCache.set(cacheKey, "Погода: невідомо");
    layer.setTooltipContent(tooltipHtml("Погода: невідомо"));
    return;
  }
  if (raionWeatherPending.has(cacheKey)) {
    try {
      const result = await raionWeatherPending.get(cacheKey);
      layer.setTooltipContent(tooltipHtml(result));
    } catch (_) { layer.setTooltipContent(tooltipHtml("Погода: невідомо")); }
    return;
  }

  const request = (async () => {
    const params = new URLSearchParams({ latitude: center[0], longitude: center[1], current: "temperature_2m,weather_code,wind_speed_10m", timezone: "Europe/Kyiv" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error("Weather unavailable");
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("No current weather");
    const [condition, icon] = WEATHER_CODES[current.weather_code] || ["невідомо", "❔"];
    return `${icon} ${condition} · ${Math.round(current.temperature_2m)}°C<br>Вітер: ${Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) + " км/год" : "невідомо"}`;
  })();
  raionWeatherPending.set(cacheKey, request);
  try {
    const result = await request;
    raionWeatherCache.set(cacheKey, result);
    layer.setTooltipContent(tooltipHtml(result));
  } catch (_) {
    raionWeatherCache.set(cacheKey, "Погода: невідомо");
    layer.setTooltipContent(tooltipHtml("Погода: невідомо"));
  } finally {
    raionWeatherPending.delete(cacheKey);
  }
}

function findParentOblastForRaion(feature) {
  if (!oblastLayer) return null;
  const parentName = normalize(raionOblastName(feature));
  if (parentName) {
    let found = null;
    oblastLayer.eachLayer((layer) => {
      if (normalize(displayOblastName(featureName(layer.feature))) === parentName || normalize(featureName(layer.feature)) === parentName) found = layer;
    });
    if (found) return found;
  }
  const center = getRaionCenter(feature);
  if (!center) return null;
  let found = null;
  const point = L.latLng(center[0], center[1]);
  oblastLayer.eachLayer((layer) => {
    try { if (layer.getBounds().contains(point)) found = layer; } catch (_) {}
  });
  return found;
}

function setupRaionFeature(feature, layer) {
  const name = raionFeatureName(feature);
  const oblast = raionOblastName(feature);
  layer.bindTooltip(`${escapeHtml(name)}<br><span class="tooltip-weather">Наведи курсор для погоди…</span>`, {
    sticky: true, direction: "top", opacity: 1, className: "raion-weather-tooltip"
  });
  layer.on({
    mouseover: (event) => {
      event.target.setStyle({ color: "#64f0d1", weight: 2.8, opacity: 1, fillColor: "#1b655f", fillOpacity: 0.55 });
      if (event.target.bringToFront) event.target.bringToFront();
      loadRaionTooltipWeather(feature, event.target);
    },
    mouseout: (event) => {
      if (raionOutlineLayer) raionOutlineLayer.resetStyle(event.target);
    },
    click: () => {
      const parentLayer = findParentOblastForRaion(feature);
      if (parentLayer) openOblastMenu(parentLayer.feature, parentLayer);
      else {
        const center = getRaionCenter(feature);
        if (center) loadWeather(oblast || "Україна", name, center);
      }
    }
  });
}

function addOblastLabels(oblasts) {
  if (oblastLabelsLayer) map.removeLayer(oblastLabelsLayer);
  oblastLabelsLayer = L.layerGroup();
  for (const feature of (oblasts.features || [])) {
    const fullName = displayOblastName(featureName(feature));
    const shortName = fullName.replace(/ область$/, "");
    const center = geometryCenter(feature);
    if (!center) continue;
    const icon = L.divIcon({
      className: "oblast-label-icon",
      html: `<span>${escapeHtml(shortName)}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    L.marker(center, { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(oblastLabelsLayer);
  }
  oblastLabelsLayer.addTo(map);
}

function setupOblastFeature(feature, layer) {
  const name = featureName(feature);
  layer.bindTooltip(`${displayOblastName(name)}<br><span class="tooltip-weather">Наведи курсор для погоди</span>`, { sticky: true, direction: "top", opacity: 1 });
  layer.on({
    mouseover: (e) => {
      e.target.setStyle({ weight: 2.6, color: "#70e0c7", fillColor: "#1d3a43", fillOpacity: 0.55 });
      loadOblastWeather(feature, e.target);
    },
    mouseout: (e) => oblastLayer && oblastLayer.resetStyle(e.target),
    click: () => openOblastMenu(feature, layer)
  });
}

function getGeoJsonNameCandidates(feature) {
  const p = propsOf(feature);
  return [
    p.name, p.NAME_1, p.NAME_2, p.NAME, p.shapeName, p.NAME_UK, p.name_uk,
    p.admin2Name, p.admin2name, p.raion, p.raion_name, p.RAION, p.raionName,
    p.admin1Name, p.admin1name, p.oblast, p.oblast_name, p.region, p.REGION
  ].filter(v => typeof v === "string" && v.trim());
}

function geometryCenter(feature) {
  try {
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      const c = bounds.getCenter();
      return [c.lat, c.lng];
    }
  } catch (_) {}
  return null;
}

function getRaionCenter(feature) {
  const p = propsOf(feature);
  const lat = Number(p.lat ?? p.latitude ?? p.center_lat ?? p.centroid_lat);
  const lon = Number(p.lon ?? p.lng ?? p.longitude ?? p.center_lon ?? p.centroid_lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= 44 && lat <= 53 && lon >= 22 && lon <= 41) return [lat, lon];
  return geometryCenter(feature);
}

async function loadDistricts(oblastName, targetList) {
  const requestId = ++districtRequestId;
  const list = targetList || $("district-list");
  const slug = findOblastSlug(oblastName);
  if (!slug) {
    list.innerHTML = '<p class="muted">Список районів не знайдено.</p>';
    return;
  }

  try {
    const response = await fetch(`${HIERARCHICAL_GEO_URL}${slug}.geojson`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`District list HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== districtRequestId) return;
    const features = Array.isArray(data.features) ? data.features : [];
    if (!features.length) throw new Error("Empty district list");

    features.sort((a, b) => featureName(a).localeCompare(featureName(b), "uk"));
    list.innerHTML = "";
    for (const feature of features) {
      const name = featureName(feature);
      const center = getRaionCenter(feature);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "district-option popup-district-option";
      button.innerHTML = `<span></span><span aria-hidden="true">›</span>`;
      button.firstElementChild.textContent = name;
      button.addEventListener("click", () => {
        if (!center) setUnknown(`${displayOblastName(oblastName)} · ${name}`, "Не вдалося визначити координати району.");
        else loadWeather(displayOblastName(oblastName), name, center);
        closeDistrictPopup();
      });
      list.appendChild(button);
    }
  } catch (error) {
    console.warn("Не вдалося завантажити список районів:", error);
    if (requestId !== districtRequestId) return;
    list.innerHTML = '<p class="muted">Не вдалося завантажити райони. Спробуй ще раз.</p>';
  }
}

async function loadWeather(oblastName, raionName, center) {
  selectedRaion = { oblastName, raionName, center };
  const place = `${oblastName} · ${raionName}`;
  $("selected-region").textContent = place;
  $("weather-condition").textContent = "Завантажуємо прогноз…";
  $("data-note").textContent = "Отримуємо актуальні дані для координат обраного району.";
  $("weather-icon").textContent = "⏳";
  $("temperature").textContent = "—";
  $("feels-like").textContent = "—";
  $("humidity").textContent = "—";
  $("wind").textContent = "—";
  $("precipitation").textContent = "—";
  $("cloud-cover").textContent = "—";

  const params = new URLSearchParams({
    latitude: center[0], longitude: center[1],
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m",
    timezone: "Europe/Kyiv"
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Weather API HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("Weather unavailable");

    const [condition, icon] = WEATHER_CODES[current.weather_code] || ["невідомо", "❔"];
    $("weather-icon").textContent = icon;
    $("weather-condition").textContent = condition;
    $("temperature").textContent = Math.round(current.temperature_2m);
    $("feels-like").textContent = Number.isFinite(current.apparent_temperature) ? `${Math.round(current.apparent_temperature)}°C` : "невідомо";
    $("humidity").textContent = Number.isFinite(current.relative_humidity_2m) ? `${current.relative_humidity_2m}%` : "невідомо";
    $("wind").textContent = Number.isFinite(current.wind_speed_10m) ? `${Math.round(current.wind_speed_10m)} км/год` : "невідомо";
    $("precipitation").textContent = Number.isFinite(current.precipitation) ? `${current.precipitation} мм` : "невідомо";
    $("cloud-cover").textContent = Number.isFinite(current.cloud_cover) ? `${current.cloud_cover}%` : "невідомо";
    $("updated-at").textContent = `Оновлено: ${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    $("data-note").textContent = "Погода показана для орієнтовного центру району; умови можуть відрізнятися в межах території.";
  } catch (error) {
    console.warn("Погодні дані недоступні:", error);
    setUnknown(place, "Не вдалося отримати дані для цього району. Спробуй пізніше.");
  }
}

async function initMap() {
  map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView([48.8, 31.2], 6);
  // Standard OpenStreetMap tiles are free and do not require an API key.
  // CSS darkens the raster layer while keeping labels and map controls legible.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
  }).addTo(map);

  try {
    const [oblastResponse, raionResponse] = await Promise.all([fetch(OBLASTS_URL), fetch(RAIONS_URL)]);
    if (!oblastResponse.ok || !raionResponse.ok) throw new Error("Не вдалося завантажити GeoJSON");
    const [oblasts, raions] = await Promise.all([oblastResponse.json(), raionResponse.json()]);

    // Області створюють базову геометрію та зберігають вибір меню при кліку на вільні ділянки.
    oblastLayer = L.geoJSON(oblasts, { style: oblastStyle, onEachFeature: setupOblastFeature }).addTo(map);

    // Райони — інтерактивний верхній шар: підсвічується лише район під курсором.
    raionOutlineLayer = L.geoJSON(raions, {
      style: { color: "#8299b8", weight: 0.95, opacity: 0.9, fillColor: "#17263a", fillOpacity: 0.13 },
      onEachFeature: setupRaionFeature
    }).addTo(map);

    // Labels are separate non-interactive markers and stay visible above the polygons.
    addOblastLabels(oblasts);
    raionOutlineLayer.bringToFront();
    if (oblastLabelsLayer) oblastLabelsLayer.eachLayer((label) => label.setZIndexOffset(1000));
    map.fitBounds(oblastLayer.getBounds(), { padding: [15, 15] });
    $("map-hint").textContent = "Наведи курсор на район для погоди · натисни на нього, щоб обрати район";
  } catch (error) {
    console.error(error);
    $("map-hint").textContent = "Не вдалося завантажити межі областей або районів";
    console.warn("GeoJSON недоступний");
  } finally {
    $("map-loading").hidden = true;
    setTimeout(() => map.invalidateSize(), 100);
  }
}

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDistrictPopup(); });
$("reset-map").addEventListener("click", () => {
  if (map && oblastLayer) map.fitBounds(oblastLayer.getBounds(), { padding: [15, 15] });
  activeOblast = null;
  $("map-hint").textContent = "Наведи курсор на район для погоди · натисни на нього, щоб обрати район";
});
window.addEventListener("load", () => {
  if (typeof L === "undefined") {
    $("map-loading").innerHTML = "<span>Не вдалося завантажити Leaflet. Перевір інтернет-з’єднання.</span>";
    return;
  }
  initMap();
});
