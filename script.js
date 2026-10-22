// Інтерактивна карта використовує межі областей у GeoJSON та погоду Open-Meteo.
const GEOJSON_URL = "https://raw.githubusercontent.com/EugeneBorshch/ukraine_geojson/master/UA_FULL_Ukraine.geojson";
const $ = (id) => document.getElementById(id);

const weatherNames = {
  0: ["Ясно", "☀️"], 1: ["Переважно ясно", "🌤️"], 2: ["Мінлива хмарність", "⛅"],
  3: ["Хмарно", "☁️"], 45: ["Туман", "🌫️"], 48: ["Туман", "🌫️"],
  51: ["Мряка", "🌦️"], 53: ["Мряка", "🌦️"], 55: ["Сильна мряка", "🌧️"],
  56: ["Крижана мряка", "🌧️"], 57: ["Крижана мряка", "🌧️"],
  61: ["Невеликий дощ", "🌦️"], 63: ["Дощ", "🌧️"], 65: ["Сильний дощ", "🌧️"],
  66: ["Крижаний дощ", "🌧️"], 67: ["Крижаний дощ", "🌧️"],
  71: ["Невеликий сніг", "🌨️"], 73: ["Сніг", "🌨️"], 75: ["Сильний сніг", "❄️"],
  77: ["Снігові зерна", "🌨️"], 80: ["Короткочасний дощ", "🌦️"],
  81: ["Зливи", "🌧️"], 82: ["Сильні зливи", "🌧️"], 85: ["Снігові заряди", "🌨️"],
  86: ["Сильні снігові заряди", "❄️"], 95: ["Гроза", "⛈️"],
  96: ["Гроза з градом", "⛈️"], 99: ["Сильна гроза з градом", "⛈️"]
};

// Назви англійською та українською — для зіставлення властивостей GeoJSON.
const REGION_ALIASES = {
  "vinnytska": ["Vinnytsia", "Vinnytska", "Вінницька"],
  "volynska": ["Volyn", "Volynska", "Волинська"],
  "dnipropetrovska": ["Dnipropetrovsk", "Dnipropetrovska", "Дніпропетровська", "Дніпропетровська область"],
  "donetska": ["Donetsk", "Donetska", "Донецька"],
  "zhytomyrska": ["Zhytomyr", "Zhytomyrska", "Житомирська"],
  "zakarpatska": ["Zakarpattia", "Zakarpatska", "Transcarpathian", "Закарпатська"],
  "zaporizka": ["Zaporizhzhia", "Zaporizka", "Запорізька"],
  "ivano-frankivska": ["Ivano-Frankivsk", "Ivano Frankivsk", "Ivano-Frankivska", "Івано-Франківська"],
  "kyivska": ["Kyiv Oblast", "Kyivska", "Київська"],
  "kirovohradska": ["Kirovohrad", "Kirovohradska", "Кіровоградська"],
  "krymska": ["Crimea", "Autonomous Republic of Crimea", "Автономна Республіка Крим", "Крим"],
  "lvivska": ["Lviv", "Lvivska", "Львівська"],
  "mykolaivska": ["Mykolaiv", "Mykolaivska", "Миколаївська"],
  "odeska": ["Odesa", "Odessa", "Odeska", "Одеська"],
  "poltavska": ["Poltava", "Poltavska", "Полтавська"],
  "rivnenska": ["Rivne", "Rivnenska", "Рівненська"],
  "sumska": ["Sumy", "Sumska", "Сумська"],
  "ternopilska": ["Ternopil", "Ternopilska", "Тернопільська"],
  "kharkivska": ["Kharkiv", "Kharkivska", "Харківська"],
  "khersonska": ["Kherson", "Khersonska", "Херсонська"],
  "khmelnytska": ["Khmelnytskyi", "Khmelnytska", "Хмельницька"],
  "cherkaska": ["Cherkasy", "Cherkaska", "Черкаська"],
  "chernivetska": ["Chernivtsi", "Chernivetska", "Чернівецька"],
  "chernihivska": ["Chernihiv", "Chernihivska", "Чернігівська"],
  "kyiv-city": ["Kyiv City", "Kyiv", "місто Київ", "м. Київ"],
  "sevastopol": ["Sevastopol", "Севастополь"]
};

const REGION_CENTERS = {
  "vinnytska": [49.2331, 28.4682], "volynska": [50.7472, 25.3254],
  "dnipropetrovska": [48.4647, 35.0462], "donetska": [48.0159, 37.8028],
  "zhytomyrska": [50.2547, 28.6587], "zakarpatska": [48.6208, 22.2879],
  "zaporizka": [47.8388, 35.1396], "ivano-frankivska": [48.9226, 24.7111],
  "kyivska": [50.4501, 30.5234], "kirovohradska": [48.5079, 32.2623],
  "krymska": [44.9521, 34.1024], "lvivska": [49.8397, 24.0297],
  "mykolaivska": [46.975, 31.9946], "odeska": [46.4825, 30.7233],
  "poltavska": [49.5883, 34.5514], "rivnenska": [50.6199, 26.2516],
  "sumska": [50.9077, 34.7981], "ternopilska": [49.5535, 25.5948],
  "kharkivska": [49.9935, 36.2304], "khersonska": [46.6354, 32.6169],
  "khmelnytska": [49.4229, 26.9871], "cherkaska": [49.4444, 32.0598],
  "chernivetska": [48.2921, 25.9358], "chernihivska": [51.4982, 31.2893],
  "kyiv-city": [50.4501, 30.5234], "sevastopol": [44.6167, 33.5254]
};

let map;
let geoLayer;
let selectedLayer = null;
let selectedRegion = null;

function normalize(value) {
  return String(value || "").toLowerCase()
    .replace(/oblast|region|область|обл\.?/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zа-яіїєґ0-9]+/g, "");
}

function featureProperties(feature) {
  return feature && feature.properties ? feature.properties : {};
}

function featureName(feature) {
  const p = featureProperties(feature);
  const candidates = [p.name, p.NAME_1, p.NAME, p.name_1, p.shapeName, p.NAME_UK, p.name_uk, p.admin1Name, p.region];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Невідома область";
}

function findRegionKey(name) {
  const n = normalize(name);
  for (const [key, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some(alias => normalize(alias) === n)) return key;
  }
  // Дозволяємо зіставлення, якщо у властивості є додаткове слово.
  for (const [key, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some(alias => n.includes(normalize(alias)) || normalize(alias).includes(n))) return key;
  }
  return null;
}

function getFeatureCenter(feature, key) {
  if (key && REGION_CENTERS[key]) return REGION_CENTERS[key];
  // Запасний варіант: центр меж області, якщо назву не вдалося зіставити.
  const bounds = L.geoJSON(feature).getBounds();
  if (bounds.isValid()) {
    const center = bounds.getCenter();
    return [center.lat, center.lng];
  }
  return null;
}

function styleFeature(feature) {
  return {
    color: "#f5f8ff",
    weight: 1.4,
    opacity: 1,
    fillColor: "#7894c9",
    fillOpacity: 0.58
  };
}

function highlightFeature(event) {
  const layer = event.target;
  layer.setStyle({ weight: 2.5, color: "#ffffff", fillColor: "#72e0d1", fillOpacity: 0.85 });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
}

function resetHighlight(event) {
  if (geoLayer) geoLayer.resetStyle(event.target);
  if (selectedLayer === event.target) {
    selectedLayer.setStyle({ weight: 2.8, color: "#ffffff", fillColor: "#72e0d1", fillOpacity: 0.85 });
  }
}

function onEachFeature(feature, layer) {
  const name = featureName(feature);
  layer.bindTooltip(name, { sticky: true, className: "oblast-label" });
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: () => selectRegion(feature, layer, name)
  });
}

function setUnknown(name, message = "Для цієї області погодні дані недоступні.") {
  $("region-name").textContent = name || "Невідома область";
  $("weather-icon").textContent = "❔";
  $("weather-status").textContent = message;
  $("temperature").textContent = "невідомо";
  $("condition").textContent = "невідомо";
  $("feels-like").textContent = "невідомо";
  $("humidity").textContent = "невідомо";
  $("wind").textContent = "невідомо";
  $("rain").textContent = "невідомо";
  $("updated-at").textContent = "Оновлення: невідомо";
}

function selectRegion(feature, layer, name) {
  if (selectedLayer && geoLayer) geoLayer.resetStyle(selectedLayer);
  selectedLayer = layer;
  selectedLayer.setStyle({ weight: 2.8, color: "#ffffff", fillColor: "#72e0d1", fillOpacity: 0.85 });
  if (selectedLayer.bringToFront) selectedLayer.bringToFront();

  const key = findRegionKey(name);
  const center = getFeatureCenter(feature, key);
  selectedRegion = { name, key, center };
  $("refresh-weather").disabled = false;

  if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
    setUnknown(name);
    return;
  }
  loadWeather(name, center);
}

function weatherDescription(code) {
  return weatherNames[code] || ["невідомо", "❔"];
}

async function loadWeather(name, center) {
  $("weather-status").textContent = "Завантажуємо погоду…";
  $("region-name").textContent = name;
  $("refresh-weather").disabled = true;

  const [latitude, longitude] = center;
  const params = new URLSearchParams({
    latitude, longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    timezone: "Europe/Kyiv"
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("No current weather data");

    const [condition, icon] = weatherDescription(current.weather_code);
    $("weather-icon").textContent = icon;
    $("weather-status").textContent = "Поточні умови за координатами області";
    $("temperature").textContent = Math.round(current.temperature_2m);
    $("condition").textContent = condition;
    $("feels-like").textContent = Number.isFinite(current.apparent_temperature) ? `${Math.round(current.apparent_temperature)}°C` : "невідомо";
    $("humidity").textContent = Number.isFinite(current.relative_humidity_2m) ? `${current.relative_humidity_2m}%` : "невідомо";
    $("wind").textContent = Number.isFinite(current.wind_speed_10m) ? `${Math.round(current.wind_speed_10m)} км/год` : "невідомо";
    $("rain").textContent = Number.isFinite(current.precipitation) ? `${current.precipitation} мм` : "невідомо";
    $("updated-at").textContent = `Оновлено: ${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  } catch (error) {
    console.warn("Weather data unavailable:", error);
    setUnknown(name, "Не вдалося отримати погодні дані.");
  } finally {
    $("refresh-weather").disabled = !selectedRegion;
  }
}

function initMap() {
  map = L.map("map", { zoomControl: true, scrollWheelZoom: false }).setView([48.8, 31.2], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
  }).addTo(map);

  fetch(GEOJSON_URL)
    .then(response => {
      if (!response.ok) throw new Error("Не вдалося завантажити межі областей");
      return response.json();
    })
    .then(geojson => {
      geoLayer = L.geoJSON(geojson, { style: styleFeature, onEachFeature }).addTo(map);
      map.fitBounds(geoLayer.getBounds(), { padding: [12, 12] });
    })
    .catch(error => {
      console.error(error);
      $("weather-status").textContent = "Не вдалося завантажити карту областей. Перевір інтернет-з'єднання.";
      $("region-name").textContent = "Карта недоступна";
    });
}

$("reset-map").addEventListener("click", () => {
  if (geoLayer) map.fitBounds(geoLayer.getBounds(), { padding: [12, 12] });
  if (selectedLayer && geoLayer) geoLayer.resetStyle(selectedLayer);
  selectedLayer = null;
  selectedRegion = null;
  $("refresh-weather").disabled = true;
  setUnknown("Обери область", "Натисни на область на карті.");
  $("temperature").textContent = "—";
  $("condition").textContent = "Погода ще не завантажена";
});

$("refresh-weather").addEventListener("click", () => {
  if (selectedRegion) loadWeather(selectedRegion.name, selectedRegion.center);
});

window.addEventListener("load", () => {
  if (typeof L === "undefined") {
    $("weather-status").textContent = "Не вдалося завантажити бібліотеку карти. Перевір інтернет-з'єднання.";
    return;
  }
  initMap();
});
