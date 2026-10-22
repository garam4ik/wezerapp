const CITIES = {
  kyiv: { name: "Київ", latitude: 50.4501, longitude: 30.5234 },
  lviv: { name: "Львів", latitude: 49.8397, longitude: 24.0297 },
  odesa: { name: "Одеса", latitude: 46.4825, longitude: 30.7233 },
  kharkiv: { name: "Харків", latitude: 49.9935, longitude: 36.2304 },
  dnipro: { name: "Дніпро", latitude: 48.4647, longitude: 35.0462 },
  zaporizhzhia: { name: "Запоріжжя", latitude: 47.8388, longitude: 35.1396 },
  vinnytsia: { name: "Вінниця", latitude: 49.2331, longitude: 28.4682 },
  chernivtsi: { name: "Чернівці", latitude: 48.2921, longitude: 25.9358 },
  uzhhorod: { name: "Ужгород", latitude: 48.6208, longitude: 22.2879 },
  poltava: { name: "Полтава", latitude: 49.5883, longitude: 34.5514 },
  chernihiv: { name: "Чернігів", latitude: 51.4982, longitude: 31.2893 },
  sumy: { name: "Суми", latitude: 50.9077, longitude: 34.7981 },
  mykolaiv: { name: "Миколаїв", latitude: 46.975, longitude: 31.9946 },
  ternopil: { name: "Тернопіль", latitude: 49.5535, longitude: 25.5948 },
  "ivano-frankivsk": { name: "Івано-Франківськ", latitude: 48.9226, longitude: 24.7111 }
};

const $ = (id) => document.getElementById(id);
const citySelect = $("city-select");
const refreshButton = $("refresh-btn");
let activeController = null;

function describeWeather(code) {
  if (code === 0) return ["Ясно", "☀️"];
  if (code === 1) return ["Переважно ясно", "🌤️"];
  if (code === 2) return ["Мінлива хмарність", "⛅"];
  if (code === 3) return ["Хмарно", "☁️"];
  if ([45, 48].includes(code)) return ["Туман", "🌫️"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["Мряка", "🌦️"];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ["Дощ", "🌧️"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["Сніг", "🌨️"];
  if ([95, 96, 99].includes(code)) return ["Гроза", "⛈️"];
  return ["Змінна погода", "🌡️"];
}

function numberOrDash(value, suffix = "") {
  return Number.isFinite(value) ? `${Math.round(value)}${suffix}` : `—${suffix}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv"
  }).format(new Date(value));
}

function renderHourly(data) {
  const times = data.hourly.time;
  const currentTime = data.current.time;
  let start = times.findIndex((time) => time >= currentTime);
  if (start < 0) start = 0;

  const cards = times.slice(start, start + 6).map((time, offset) => {
    const i = start + offset;
    const [description, icon] = describeWeather(data.hourly.weather_code[i]);
    const rainChance = data.hourly.precipitation_probability?.[i];
    return `
      <article class="hour-card" aria-label="${formatTime(time)}, ${description}">
        <div class="hour-time">${i === start ? "Зараз" : formatTime(time)}</div>
        <div class="hour-icon" aria-hidden="true">${icon}</div>
        <div class="hour-temp">${numberOrDash(data.hourly.temperature_2m[i], "°")}</div>
        <div class="hour-rain">${Number.isFinite(rainChance) ? `Опади ${rainChance}%` : "Прогноз"}</div>
      </article>`;
  });
  $("hourly-forecast").innerHTML = cards.join("");
}

async function loadWeather() {
  const city = CITIES[citySelect.value] || CITIES.kyiv;
  if (activeController) activeController.abort();
  activeController = new AbortController();

  $("status").textContent = "Оновлюємо погодні дані…";
  refreshButton.disabled = true;

  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "is_day", "precipitation", "weather_code", "cloud_cover", "wind_speed_10m"
    ].join(","),
    hourly: "temperature_2m,weather_code,precipitation_probability",
    timezone: "Europe/Kyiv",
    forecast_days: "2"
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: activeController.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Помилка сервера: ${response.status}`);
    const data = await response.json();
    const current = data.current;
    const [description, icon] = describeWeather(current.weather_code);

    $("city-name").textContent = `${city.name}, Україна`;
    $("local-date").textContent = new Intl.DateTimeFormat("uk-UA", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Kyiv"
    }).format(new Date(current.time));
    $("weather-icon").textContent = icon;
    $("temperature").textContent = numberOrDash(current.temperature_2m);
    $("condition").textContent = description;
    $("feels-like").textContent = numberOrDash(current.apparent_temperature, "°C");
    $("humidity").textContent = numberOrDash(current.relative_humidity_2m, "%");
    $("wind").textContent = numberOrDash(current.wind_speed_10m, " км/год");
    $("precipitation").textContent = numberOrDash(current.precipitation, " мм");
    $("cloud-cover").textContent = numberOrDash(current.cloud_cover, "%");
    renderHourly(data);

    $("last-updated").textContent = `Оновлено: ${new Intl.DateTimeFormat("uk-UA", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Kyiv"
    }).format(new Date())}`;
    $("status").textContent = "Дані успішно оновлено.";
  } catch (error) {
    if (error.name === "AbortError") return;
    $("status").textContent = "Не вдалося завантажити погоду. Перевір інтернет і спробуй ще раз.";
    $("condition").textContent = "Дані тимчасово недоступні";
    console.error("Weather API error:", error);
  } finally {
    refreshButton.disabled = false;
  }
}

citySelect.addEventListener("change", loadWeather);
refreshButton.addEventListener("click", loadWeather);

// API може оновлювати модель рідше, ніж раз на хвилину; інтерфейс повторно запитує дані щохвилини.
loadWeather();
setInterval(loadWeather, 60_000);
