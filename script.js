const OBLASTS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/regiony.geojson";
const RAIONS_URL = "https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/rayony.geojson";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CODES = {
  0:"Ясно",1:"Переважно ясно",2:"Мінлива хмарність",3:"Хмарно",45:"Туман",48:"Туман",
  51:"Мряка",53:"Мряка",55:"Сильна мряка",56:"Крижана мряка",57:"Крижана мряка",
  61:"Невеликий дощ",63:"Дощ",65:"Сильний дощ",66:"Крижаний дощ",67:"Крижаний дощ",
  71:"Невеликий сніг",73:"Сніг",75:"Сильний сніг",77:"Снігові зерна",80:"Короткочасний дощ",
  81:"Зливи",82:"Сильні зливи",85:"Снігові заряди",86:"Сильні снігові заряди",95:"Гроза",96:"Гроза з градом",99:"Сильна гроза з градом"
};
let map;
let oblastFeatures = [];
let districtItems = [];
let selectedOblast = null;
let hoveredItem = null;
let hoveredLatLng = null;
let requestSequence = 0;
const weatherCache = new Map();
const weatherPending = new Map();
const featureNames = new WeakMap();
const districtTooltip = () => document.getElementById("district-tooltip");

function propsOf(feature) { return feature?.properties || {}; }
function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("uk-UA").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[’'`]/g, "").replace(/[^a-zа-яіїєґ0-9]/g, "");
}
function getName(feature, kind = "district") {
  if (featureNames.has(feature)) return featureNames.get(feature);
  const p = propsOf(feature);
  const keys = kind === "oblast"
    ? ["name_uk","NAME_1","name","NAME","shapeName","region_name","oblast_name","admin1Name","NAME_UK"]
    : ["name_uk","raion_name","raionName","admin2Name","NAME_2","NAME_3","name_2","name_3","shapeName","NAME_UK","name","NAME","name_1"];
  let value;
  for (const key of keys) if (typeof p[key] === "string" && p[key].trim()) { value = p[key].trim(); break; }
  if (!value) {
    const pattern = kind === "oblast" ? /oblast|region|admin1|name/i : /raion|district|admin2|name|shape/i;
    value = Object.entries(p).find(([key, v]) => pattern.test(key) && typeof v === "string" && v.trim() && !/^ukraine$/i.test(v.trim()))?.[1];
  }
  if (!value) value = Object.values(p).find(v => typeof v === "string" && v.trim() && !/^ukraine$/i.test(v.trim()));
  value = value ? String(value).trim() : (kind === "oblast" ? "Область" : "Район без назви");
  featureNames.set(feature, value);
  return value;
}
function centerOf(feature) {
  try { const b = L.geoJSON(feature).getBounds(); if (b.isValid()) { const c = b.getCenter(); return [c.lat, c.lng]; } } catch (_) {}
  return null;
}
function pointInRing(point, ring) {
  const x = point[1], y = point[0]; let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(point, rings[i])) return false;
  return true;
}
function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(poly => pointInPolygon(point, poly));
  return false;
}
function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat(1);
  return [];
}
function districtSamples(feature) {
  const rings = ringsOf(feature.geometry).filter(r => r.length > 3);
  const samples = [];
  for (const ring of rings) {
    const stride = Math.max(1, Math.floor(ring.length / 30));
    for (let i = 0; i < ring.length; i += stride) {
      const [lng, lat] = ring[i];
      if (Number.isFinite(lat) && Number.isFinite(lng)) samples.push([lat, lng]);
    }
  }
  const center = centerOf(feature);
  if (center) samples.push(center);
  return samples;
}
function findOblastForDistrict(feature) {
  const p = propsOf(feature);
  const parentKeys = ["oblast", "oblast_name", "region", "region_name", "adm1_name", "NAME_1", "name_1", "admin1Name", "parent_name"];
  const parentValue = parentKeys.map(k => p[k]).find(v => typeof v === "string" && v.trim());
  if (parentValue) {
    const wanted = normalize(parentValue);
    const byName = oblastFeatures.find(o => normalize(getName(o, "oblast")) === wanted || normalize(getName(o, "oblast")).includes(wanted) || wanted.includes(normalize(getName(o, "oblast"))));
    if (byName) return byName;
  }
  const samples = districtSamples(feature);
  if (!samples.length) return null;
  let best = null, bestScore = -1;
  for (const oblast of oblastFeatures) {
    let score = 0;
    for (const point of samples) if (pointInGeometry(point, oblast.geometry)) score++;
    if (score > bestScore) { best = oblast; bestScore = score; }
  }
  // The majority-of-boundary-points test is resilient to a district's bounding-box centre falling outside its polygon.
  return bestScore > 0 ? best : null;
}
function baseStyle() { return { color: "#252b35", weight: 0.9, opacity: 1, fillColor: "#3b414d", fillOpacity: 1 }; }
function activeStyle() { return { color: "#fff", weight: 2.2, opacity: 1, fillColor: "#596273", fillOpacity: 1 }; }
function refreshStyles() {
  for (const item of districtItems) {
    const active = item === hoveredItem;
    item.layer.setStyle(active ? activeStyle() : baseStyle());
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function positionTooltip(latlng) {
  const el = districtTooltip();
  if (!el || !latlng) return;
  const point = map.latLngToContainerPoint(latlng);
  const mapRect = map.getContainer().getBoundingClientRect();
  const width = el.offsetWidth || 210;
  let left = point.x + 14, top = point.y - el.offsetHeight - 12;
  if (left + width > mapRect.width - 8) left = point.x - width - 14;
  if (top < 8) top = point.y + 14;
  el.style.left = `${Math.max(8, Math.min(left, mapRect.width - width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(top, mapRect.height - el.offsetHeight - 8))}px`;
}
function showTooltip(latlng, name, weather) {
  const el = districtTooltip();
  if (!el) return;
  // A single fixed DOM element prevents Leaflet from leaving multiple tooltip layers behind.
  el.innerHTML = `<strong>${escapeHtml(name)}</strong><div class="tooltip-weather">${weather}</div>`;
  el.hidden = false;
  positionTooltip(latlng);
}
function hideTooltip() { const el = districtTooltip(); if (el) el.hidden = true; }
function weatherKey(feature) {
  const c = centerOf(feature);
  return c ? `${c[0].toFixed(3)},${c[1].toFixed(3)}` : normalize(getName(feature));
}
async function loadWeather(feature) {
  const key = weatherKey(feature);
  if (weatherCache.has(key)) return weatherCache.get(key);
  if (weatherPending.has(key)) return weatherPending.get(key);
  const center = centerOf(feature);
  if (!center) return "Погода: невідомо";
  const params = new URLSearchParams({ latitude: String(center[0]), longitude: String(center[1]), current: "temperature_2m,weather_code,wind_speed_10m", timezone: "Europe/Kyiv" });
  const task = fetch(`${WEATHER_URL}?${params}`).then(r => { if (!r.ok) throw new Error("Weather request failed"); return r.json(); })
    .then(data => {
      const c = data.current;
      if (!c || !Number.isFinite(c.temperature_2m)) throw new Error("Weather missing");
      const condition = WEATHER_CODES[c.weather_code] || "невідомо";
      return `${escapeHtml(condition)} · ${Math.round(c.temperature_2m)}°C<br>Вітер: ${Number.isFinite(c.wind_speed_10m) ? Math.round(c.wind_speed_10m) + " км/год" : "невідомо"}`;
    }).catch(() => "Погода: невідомо").then(result => { weatherCache.set(key, result); weatherPending.delete(key); return result; });
  weatherPending.set(key, task);
  return task;
}
async function onDistrictEnter(item, latlng) {
  // A hover must work immediately: infer the active oblast from the district if none is selected,
  // or switch the active oblast when the pointer enters a district in another oblast.
  if (!item.oblast) item.oblast = findOblastForDistrict(item.feature);
  if (item.oblast) selectedOblast = item.oblast;
  hoveredItem = item;
  hoveredLatLng = latlng;
  refreshStyles();
  const seq = ++requestSequence;
  const name = getName(item.feature);
  showTooltip(latlng, name, "Завантажуємо погоду…");
  const weather = await loadWeather(item.feature);
  if (seq !== requestSequence || hoveredItem !== item) return;
  const el = districtTooltip();
  if (el && !el.hidden) showTooltip(hoveredLatLng || latlng, name, weather);
}
function bindDistrict(feature, layer) {
  const item = { feature, layer, oblast: null };
  districtItems.push(item);
  layer.on({
    mouseover: e => { void onDistrictEnter(item, e.latlng); },
    mousemove: e => {
      if (hoveredItem === item && !districtTooltip().hidden) {
        hoveredLatLng = e.latlng;
        positionTooltip(e.latlng);
      }
    },
    mouseout: () => {
      if (hoveredItem === item) {
        hoveredItem = null;
        hoveredLatLng = null;
        requestSequence++;
        hideTooltip();
        refreshStyles();
      }
    },
    click: e => {
      if (!item.oblast) item.oblast = findOblastForDistrict(feature);
      if (item.oblast) selectedOblast = item.oblast;
      hoveredItem = item;
      hoveredLatLng = e.latlng;
      refreshStyles();
      const seq = ++requestSequence;
      const name = getName(feature);
      showTooltip(e.latlng, name, "Завантажуємо погоду…");
      loadWeather(feature).then(weather => {
        if (seq === requestSequence && hoveredItem === item && !districtTooltip().hidden) showTooltip(hoveredLatLng || e.latlng, name, weather);
      });
    }
  });
}
function init() {
  map = L.map("map", { zoomControl: false, attributionControl: false, scrollWheelZoom: true, doubleClickZoom: true, preferCanvas: false }).setView([48.8, 31.2], 6);
  map.createPane("oblastPane");
  map.getPane("oblastPane").style.zIndex = 390;
  map.getPane("overlayPane").style.zIndex = 410;
  Promise.all([fetch(OBLASTS_URL), fetch(RAIONS_URL)]).then(async ([or, rr]) => {
    if (!or.ok || !rr.ok) throw new Error("GeoJSON download failed");
    const [oblasts, raions] = await Promise.all([or.json(), rr.json()]);
    oblastFeatures = (oblasts.features || []).filter(f => f.geometry);
    const districtLayer = L.geoJSON(raions, { style: baseStyle, onEachFeature: bindDistrict }).addTo(map);
    districtItems.forEach(item => { item.oblast = findOblastForDistrict(item.feature); });
    // Boundaries of oblasts are drawn beneath districts; district polygons receive the mouse events.
    L.geoJSON(oblasts, { pane: "oblastPane", interactive: false, style: { color: "#fff", weight: 1.8, opacity: 1, fill: false } }).addTo(map);
    const bounds = districtLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [12, 12] });
    document.getElementById("map-loading").hidden = true;
    setTimeout(() => map.invalidateSize(), 100);
  }).catch(error => {
    console.error("Map boundary loading failed:", error);
    const loading = document.getElementById("map-loading");
    loading.textContent = "Не вдалося завантажити межі. Перевірте інтернет-з’єднання.";
  });
}
window.addEventListener("load", () => {
  if (typeof L === "undefined") { document.getElementById("map-loading").textContent = "Не вдалося завантажити бібліотеку карти."; return; }
  init();
});
