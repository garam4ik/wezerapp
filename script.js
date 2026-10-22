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

let map, oblastLayer, raionOutlineLayer;
let activeOblast = null;
let selectedRaion = null;
let districtRequestId = 0;

function normalize(s) {
  return String(s || "").toLocaleLowerCase("uk-UA")
    .replace(/область|обл\\.?/g, "").replace(/[’'`]/g, "")
    .replace(/[^a-zа-яіїєґ0-9]/g, "");
}

function propsOf(feature) { return feature && feature.properties ? feature.properties : {}; }

function featureName(feature) {
  const p = propsOf(feature);
  const vals = [p.name, p.NAME_1, p.NAME_2, p.NAME, p.shapeName, p.NAME_UK, p.name_uk, p.admin2Name, p.admin1Name, p.region, p.raion, p.raion_name];
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "Невідомо";
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
function showModal() { $("district-modal").hidden = false; $("close-modal").focus(); }
function closeModal() { $("district-modal").hidden = true; }

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
  $("dialog-title").textContent = displayOblastName(activeOblast.name);
  $("dialog-subtitle").textContent = "Обери район зі списку, щоб переглянути погоду";
  $("district-list").innerHTML = '<p class="muted">Завантажуємо райони області…</p>';
  showModal();
  loadDistricts(activeOblast.name);
}

function setupOblastFeature(feature, layer) {
  const name = featureName(feature);
  layer.bindTooltip(displayOblastName(name), { sticky: true });
  layer.on({
    mouseover: (e) => e.target.setStyle({ weight: 2.6, color: "#70e0c7", fillColor: "#1d3a43", fillOpacity: 0.55 }),
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

async function loadDistricts(oblastName) {
  const requestId = ++districtRequestId;
  const slug = findOblastSlug(oblastName);
  if (!slug) {
    $("district-list").innerHTML = '<p class="muted">Список районів для цієї області не знайдено. Спробуй іншу область.</p>';
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
    $("district-list").innerHTML = "";
    for (const feature of features) {
      const name = featureName(feature);
      const center = getRaionCenter(feature);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "district-option";
      button.innerHTML = `<span></span><span aria-hidden="true">›</span>`;
      button.firstElementChild.textContent = name;
      button.addEventListener("click", () => {
        if (!center) setUnknown(`${displayOblastName(oblastName)} · ${name}`, "Не вдалося визначити координати району.");
        else loadWeather(displayOblastName(oblastName), name, center);
        closeModal();
      });
      $("district-list").appendChild(button);
    }
  } catch (error) {
    console.warn("Не вдалося завантажити список районів:", error);
    if (requestId !== districtRequestId) return;
    $("district-list").innerHTML = '<p class="muted">Не вдалося завантажити райони. Перевір інтернет-з’єднання та спробуй ще раз.</p>';
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
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd", maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
  }).addTo(map);

  try {
    const [oblastResponse, raionResponse] = await Promise.all([fetch(OBLASTS_URL), fetch(RAIONS_URL)]);
    if (!oblastResponse.ok || !raionResponse.ok) throw new Error("Не вдалося завантажити GeoJSON");
    const [oblasts, raions] = await Promise.all([oblastResponse.json(), raionResponse.json()]);

    // Райони показані лініями на всій карті; цей шар не перехоплює натискання.
    raionOutlineLayer = L.geoJSON(raions, {
      interactive: false,
      style: { color: "#7189aa", weight: 0.85, opacity: 0.78, fillOpacity: 0 }
    }).addTo(map);

    oblastLayer = L.geoJSON(oblasts, { style: oblastStyle, onEachFeature: setupOblastFeature }).addTo(map);
    map.fitBounds(oblastLayer.getBounds(), { padding: [15, 15] });
    $("map-hint").textContent = "Натисни на область, щоб відкрити список районів";
  } catch (error) {
    console.error(error);
    $("map-hint").textContent = "Не вдалося завантажити межі областей або районів";
    $("district-list").innerHTML = '<p class="muted">Дані карти тимчасово недоступні.</p>';
  } finally {
    $("map-loading").hidden = true;
    setTimeout(() => map.invalidateSize(), 100);
  }
}

$("close-modal").addEventListener("click", closeModal);
$("district-modal").addEventListener("click", (event) => {
  if (event.target === $("district-modal")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
$("reset-map").addEventListener("click", () => {
  if (map && oblastLayer) map.fitBounds(oblastLayer.getBounds(), { padding: [15, 15] });
  activeOblast = null;
  $("map-hint").textContent = "Натисни на область, щоб відкрити список районів";
});
window.addEventListener("load", () => {
  if (typeof L === "undefined") {
    $("map-loading").innerHTML = "<span>Не вдалося завантажити Leaflet. Перевір інтернет-з’єднання.</span>";
    return;
  }
  initMap();
});
