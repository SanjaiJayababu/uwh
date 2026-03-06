import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const DEFAULT_BGM_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
const STORAGE_BGM_URL = "cosmic-weather:bgm-url";

const $ = (sel) => document.querySelector(sel);

const locBtn = $("#locBtn");
const audioToggle = $("#audioToggle");
const audioConfig = $("#audioConfig");
const bgmDialog = $("#bgmDialog");
const bgmUrlInput = $("#bgmUrlInput");
const saveBgm = $("#saveBgm");

const searchForm = $("#searchForm");
const cityInput = $("#cityInput");
const suggestions = $("#suggestions");

const locTitle = $("#locTitle");
const locBody = $("#locBody");
const locUpdated = $("#locUpdated");
const locBadge = $("#locBadge");

const cityTitle = $("#cityTitle");
const cityBody = $("#cityBody");
const cityUpdated = $("#cityUpdated");
const cityBadge = $("#cityBadge");

const bgm = (() => {
  const el = document.createElement("audio");
  el.id = "bgm";
  el.loop = true;
  el.preload = "auto";
  el.crossOrigin = "anonymous";
  document.body.appendChild(el);
  return el;
})();

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatTemp(c) {
  if (c == null || Number.isNaN(c)) return "—";
  return `${Math.round(c)}°C`;
}

function formatKmH(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return "—";
  return `${Math.round(kmh)} km/h`;
}

function formatPct(p) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${Math.round(p)}%`;
}

function formatMm(mm) {
  if (mm == null || Number.isNaN(mm)) return "—";
  return `${mm.toFixed(1)} mm`;
}

function formatTimeLocal(iso, tz) {
  try {
    const d = new Date(iso);
    const f = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      month: "short",
      day: "2-digit",
      timeZone: tz || undefined,
    });
    return f.format(d);
  } catch {
    return iso;
  }
}

function weatherLabelFromCode(code) {
  // Open-Meteo weather codes
  if (code == null) return "—";
  const c = Number(code);
  if (c === 0) return "Clear sky";
  if (c === 1) return "Mainly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if ([45, 48].includes(c)) return "Fog";
  if ([51, 53, 55].includes(c)) return "Drizzle";
  if ([56, 57].includes(c)) return "Freezing drizzle";
  if ([61, 63, 65].includes(c)) return "Rain";
  if ([66, 67].includes(c)) return "Freezing rain";
  if ([71, 73, 75, 77].includes(c)) return "Snow";
  if ([80, 81, 82].includes(c)) return "Rain showers";
  if ([85, 86].includes(c)) return "Snow showers";
  if ([95].includes(c)) return "Thunderstorm";
  if ([96, 99].includes(c)) return "Thunderstorm with hail";
  return "Mixed conditions";
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function setSuggestionsOpen(open) {
  suggestions.classList.toggle("open", open);
}

function renderSuggestions(list) {
  if (!Array.isArray(list) || list.length === 0) {
    suggestions.innerHTML = "";
    setSuggestionsOpen(false);
    return;
  }

  const inner = document.createElement("div");
  inner.className = "suggestionsInner";
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.setAttribute("role", "option");
    btn.innerHTML = `
      <div>
        <div class="sMain">${escapeHtml(item.name)}</div>
        <div class="sSub">${escapeHtml(item.admin1 || item.country || "")}${item.country && item.admin1 ? ", " + escapeHtml(item.country) : ""}</div>
      </div>
      <div class="sSub">${item.latitude.toFixed(2)}, ${item.longitude.toFixed(2)}</div>
    `;
    btn.addEventListener("click", async () => {
      setSuggestionsOpen(false);
      suggestions.innerHTML = "";
      cityInput.value = item.name;
      await loadCityWeather(item);
    });
    inner.appendChild(btn);
  }
  suggestions.innerHTML = "";
  suggestions.appendChild(inner);
  setSuggestionsOpen(true);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    name
  )}&count=6&language=en&format=json`;
  const data = await fetchJson(url);
  return data?.results ?? [];
}

async function reverseGeocode(lat, lon) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(
    lat
  )}&longitude=${encodeURIComponent(lon)}&language=en&format=json`;
  try {
    const data = await fetchJson(url);
    const r = data?.results?.[0];
    if (!r) return null;
    const parts = [r.name, r.admin1, r.country].filter(Boolean);
    return parts.join(", ");
  } catch {
    return null;
  }
}

async function fetchForecast(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code` +
    `&hourly=precipitation_probability,precipitation,rain,weather_code,temperature_2m,relative_humidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,weather_code,sunrise,sunset` +
    `&timezone=auto&forecast_days=7`;
  return await fetchJson(url);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchArchiveHigh(lat, lon) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 30);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(
      lon
    )}` +
    `&start_date=${isoDate(start)}&end_date=${isoDate(end)}&daily=temperature_2m_max&timezone=auto`;
  const data = await fetchJson(url, 20000);
  const times = data?.daily?.time ?? [];
  const tmax = data?.daily?.temperature_2m_max ?? [];
  let best = -Infinity;
  let bestDay = null;
  for (let i = 0; i < Math.min(times.length, tmax.length); i++) {
    const v = tmax[i];
    if (v == null || Number.isNaN(v)) continue;
    if (v > best) {
      best = v;
      bestDay = times[i];
    }
  }
  if (!Number.isFinite(best) || !bestDay) return null;
  return { valueC: best, day: bestDay, rangeYears: 30 };
}

function pickUpcomingRainEvents(forecast, limit = 5) {
  const tz = forecast?.timezone;
  const times = forecast?.hourly?.time ?? [];
  const precip = forecast?.hourly?.precipitation ?? [];
  const rain = forecast?.hourly?.rain ?? [];
  const prob = forecast?.hourly?.precipitation_probability ?? [];
  const code = forecast?.hourly?.weather_code ?? [];

  const out = [];
  for (let i = 0; i < times.length; i++) {
    const mm = (rain[i] ?? precip[i]) ?? 0;
    const p = prob[i] ?? null;
    const isRainy = (mm != null && mm > 0.1) || (p != null && p >= 45);
    if (!isRainy) continue;
    out.push({
      time: times[i],
      mm,
      p,
      label: weatherLabelFromCode(code[i]),
      tz,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function setCardLoading(which, titleText) {
  const isLoc = which === "loc";
  const title = isLoc ? locTitle : cityTitle;
  const body = isLoc ? locBody : cityBody;
  const badge = isLoc ? locBadge : cityBadge;
  title.textContent = titleText;
  body.className = "cardBody skeleton";
  body.innerHTML = `
    <div class="bigStat"></div>
    <div class="miniGrid">
      <div class="mini"></div>
      <div class="mini"></div>
      <div class="mini"></div>
      <div class="mini"></div>
    </div>
    <div class="divider"></div>
    <div class="lines">
      <div class="line"></div>
      <div class="line"></div>
      <div class="line"></div>
    </div>
  `;
  badge.classList.toggle("badgeDim", false);
}

function setUpdated(which, s) {
  const el = which === "loc" ? locUpdated : cityUpdated;
  el.textContent = s;
}

function renderWeatherCard(which, placeLabel, forecast, archiveHigh) {
  const isLoc = which === "loc";
  const title = isLoc ? locTitle : cityTitle;
  const body = isLoc ? locBody : cityBody;
  const badge = isLoc ? locBadge : cityBadge;

  const cur = forecast?.current ?? {};
  const daily = forecast?.daily ?? {};
  const tz = forecast?.timezone;

  const nowTemp = cur.temperature_2m;
  const feel = cur.apparent_temperature;
  const hum = cur.relative_humidity_2m;
  const wind = cur.wind_speed_10m;
  const cloud = cur.cloud_cover;
  const wcode = cur.weather_code;
  const desc = weatherLabelFromCode(wcode);

  const todayMax = daily?.temperature_2m_max?.[0];
  const todayMin = daily?.temperature_2m_min?.[0];
  const pmax = daily?.precipitation_probability_max?.[0];
  const rainSum = daily?.rain_sum?.[0] ?? daily?.precipitation_sum?.[0];
  const sunrise = daily?.sunrise?.[0];
  const sunset = daily?.sunset?.[0];

  const rainEvents = pickUpcomingRainEvents(forecast, 5);

  title.textContent = placeLabel;
  badge.classList.toggle("badgeDim", false);
  body.className = "cardBody";

  const rainListHtml =
    rainEvents.length === 0
      ? `<div class="muted">No rain predicted soon (based on hourly precipitation & probability).</div>`
      : `<div class="rainList">
          ${rainEvents
            .map((e) => {
              const when = formatTimeLocal(e.time, e.tz);
              const detail = [
                e.mm != null ? `${formatMm(e.mm)}` : null,
                e.p != null ? `${formatPct(e.p)}` : null,
              ]
                .filter(Boolean)
                .join(" • ");
              return `
                <div class="rainItem">
                  <div>
                    <div class="rainWhen">${escapeHtml(when)}</div>
                    <div class="rainSmall">${escapeHtml(e.label)}</div>
                  </div>
                  <div class="rainWhat">${escapeHtml(detail || "—")}</div>
                </div>
              `;
            })
            .join("")}
        </div>`;

  const archiveHtml = archiveHigh
    ? `<div class="miniCard">
        <div class="miniLabel">Highest daily max (${archiveHigh.rangeYears}y)</div>
        <div class="miniValue">${formatTemp(archiveHigh.valueC)} <span class="muted">on ${escapeHtml(
        archiveHigh.day
      )}</span></div>
      </div>`
    : `<div class="miniCard">
        <div class="miniLabel">Highest daily max (30y)</div>
        <div class="miniValue">—</div>
      </div>`;

  body.innerHTML = `
    <div class="bigRow">
      <div>
        <div class="temp">${formatTemp(nowTemp)}</div>
        <div class="desc">${escapeHtml(desc)}</div>
        <div class="meta">
          <div class="pill"><strong>Feels</strong> ${formatTemp(feel)}</div>
          <div class="pill"><strong>Humidity</strong> ${formatPct(hum)}</div>
          <div class="pill"><strong>Wind</strong> ${formatKmH(wind)}</div>
          <div class="pill"><strong>Cloud</strong> ${formatPct(cloud)}</div>
        </div>
      </div>
      <div class="pill"><strong>Today</strong> ${formatTemp(todayMin)} → ${formatTemp(todayMax)}</div>
    </div>

    <div class="miniGrid">
      <div class="miniCard">
        <div class="miniLabel">Rain chance (today)</div>
        <div class="miniValue">${formatPct(pmax)}</div>
      </div>
      <div class="miniCard">
        <div class="miniLabel">Rain total (today)</div>
        <div class="miniValue">${formatMm(rainSum ?? 0)}</div>
      </div>
      <div class="miniCard">
        <div class="miniLabel">Sunrise</div>
        <div class="miniValue">${sunrise ? escapeHtml(formatTimeLocal(sunrise, tz)) : "—"}</div>
      </div>
      <div class="miniCard">
        <div class="miniLabel">Sunset</div>
        <div class="miniValue">${sunset ? escapeHtml(formatTimeLocal(sunset, tz)) : "—"}</div>
      </div>
      ${archiveHtml}
      <div class="miniCard">
        <div class="miniLabel">Coords</div>
        <div class="miniValue">${forecast.latitude.toFixed(2)}, ${forecast.longitude.toFixed(2)}</div>
      </div>
    </div>

    <div class="divider"></div>
    <div style="margin-bottom:10px; font-weight:800;">Upcoming rain events</div>
    ${rainListHtml}
  `;
}

function setCityEmptyState() {
  cityBadge.classList.add("badgeDim");
  cityTitle.textContent = "Search a city to begin";
  cityBody.className = "cardBody emptyState";
  cityBody.innerHTML = `
    <div class="emptyIcon" aria-hidden="true"></div>
    <div class="emptyText">
      <div class="emptyTitle">No city selected yet.</div>
      <div class="muted">Use the search box above to fetch humidity, rain events, and historical highs.</div>
    </div>
  `;
  setUpdated("city", "—");
}

async function loadLocationWeather() {
  setCardLoading("loc", "Detecting your location…");
  setUpdated("loc", "—");

  const pos = await new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 2 * 60 * 1000,
    });
  });

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  const place = (await reverseGeocode(lat, lon)) || `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`;
  setCardLoading("loc", place);

  const forecast = await fetchForecast(lat, lon);
  const updatedAt = new Date();
  renderWeatherCard("loc", place, forecast, null);
  setUpdated("loc", `Updated: ${updatedAt.toLocaleString()}`);
}

async function loadCityWeather(geo) {
  const labelParts = [geo.name, geo.admin1, geo.country].filter(Boolean);
  const place = labelParts.join(", ");
  setCardLoading("city", place);
  setUpdated("city", "Fetching forecast + history…");
  cityBadge.classList.remove("badgeDim");

  const [forecast, high] = await Promise.all([fetchForecast(geo.latitude, geo.longitude), fetchArchiveHigh(geo.latitude, geo.longitude)]);

  renderWeatherCard("city", place, forecast, high);
  setUpdated("city", `Updated: ${new Date().toLocaleString()}`);
}

function getSavedBgmUrl() {
  const v = localStorage.getItem(STORAGE_BGM_URL);
  return v && v.trim().length > 0 ? v.trim() : DEFAULT_BGM_URL;
}

function setBgmUrl(url) {
  localStorage.setItem(STORAGE_BGM_URL, url);
  bgm.src = url;
}

async function toggleBgm() {
  const isOn = audioToggle.getAttribute("aria-pressed") === "true";
  if (isOn) {
    audioToggle.setAttribute("aria-pressed", "false");
    audioToggle.textContent = "BGM Off";
    bgm.pause();
    return;
  }

  audioToggle.setAttribute("aria-pressed", "true");
  audioToggle.textContent = "BGM On";
  try {
    if (!bgm.src) bgm.src = getSavedBgmUrl();
    bgm.volume = 0.22;
    await bgm.play();
  } catch {
    audioToggle.setAttribute("aria-pressed", "false");
    audioToggle.textContent = "BGM Off";
    // Autoplay may be blocked until user interacts again.
  }
}

function initBgm() {
  bgm.src = getSavedBgmUrl();
  bgmUrlInput.value = bgm.src;

  audioToggle.addEventListener("click", toggleBgm);
  audioConfig.addEventListener("click", () => {
    bgmUrlInput.value = getSavedBgmUrl();
    bgmDialog.showModal();
  });

  saveBgm.addEventListener("click", (e) => {
    e.preventDefault();
    const url = bgmUrlInput.value.trim();
    if (url) setBgmUrl(url);
    bgmDialog.close();
  });
}

function initSearch() {
  const doSearch = async () => {
    const q = cityInput.value.trim();
    if (!q) return;
    try {
      const results = await geocodeCity(q);
      renderSuggestions(results.slice(0, 6));
      if (results.length === 1) await loadCityWeather(results[0]);
    } catch {
      renderSuggestions([]);
      cityBadge.classList.add("badgeDim");
      cityTitle.textContent = "Search failed (network?)";
      cityBody.className = "cardBody";
      cityBody.innerHTML = `<div class="muted">Couldn’t fetch city results right now. Try again.</div>`;
    }
  };

  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await doSearch();
  });

  cityInput.addEventListener("input", async () => {
    const q = cityInput.value.trim();
    if (q.length < 2) {
      renderSuggestions([]);
      return;
    }
    try {
      const results = await geocodeCity(q);
      renderSuggestions(results.slice(0, 6));
    } catch {
      renderSuggestions([]);
    }
  });

  document.addEventListener("click", (e) => {
    if (!suggestions.contains(e.target) && e.target !== cityInput) {
      setSuggestionsOpen(false);
    }
  });

  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", async () => {
      cityInput.value = chip.getAttribute("data-city") || "";
      await doSearch();
    });
  }
}

function initLocationButton() {
  locBtn.addEventListener("click", async () => {
    try {
      await loadLocationWeather();
    } catch (err) {
      locBadge.classList.add("badgeDim");
      locTitle.textContent = "Location unavailable";
      locBody.className = "cardBody";
      locBody.innerHTML = `<div class="muted">Allow location permission in the browser, then try again.</div>`;
      setUpdated("loc", String(err?.message || "—"));
    }
  });
}

function initEarth() {
  const canvas = $("#earth");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    canvas.style.display = "none";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3.1);

  const light = new THREE.DirectionalLight(0xffffff, 1.6);
  light.position.set(5, 2, 5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x6b7cff, 0.35));

  const loader = new THREE.TextureLoader();

  const earthTex = loader.load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg");
  const bumpTex = loader.load("https://threejs.org/examples/textures/planets/earth_normal_2048.jpg");
  const specTex = loader.load("https://threejs.org/examples/textures/planets/earth_specular_2048.jpg");
  const cloudsTex = loader.load("https://threejs.org/examples/textures/planets/earth_clouds_1024.png");

  const earthGeo = new THREE.SphereGeometry(1, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTex,
    normalMap: bumpTex,
    specularMap: specTex,
    specular: new THREE.Color(0x222222),
    shininess: 10,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.007, 64, 64),
    new THREE.MeshPhongMaterial({
      map: cloudsTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
  );
  scene.add(clouds);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0x2de1ff,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
  );
  scene.add(glow);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  let t = 0;
  function animate() {
    t += 0.0012;
    earth.rotation.y += 0.0014;
    earth.rotation.x = Math.sin(t) * 0.05;
    clouds.rotation.y += 0.0018;
    glow.rotation.y += 0.0008;

    // Place Earth slightly off-center for “real world spinning background” feel
    earth.position.x = 0.85;
    earth.position.y = -0.35;
    clouds.position.copy(earth.position);
    glow.position.copy(earth.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

function init() {
  setCityEmptyState();
  initBgm();
  initSearch();
  initLocationButton();
  initEarth();

  // Autoload location weather (falls back gracefully if denied)
  loadLocationWeather().catch(() => {
    locBadge.classList.add("badgeDim");
    locTitle.textContent = "Location permission needed";
    locBody.className = "cardBody";
    locBody.innerHTML = `<div class="muted">Click “Use my location” and allow permission to see your current weather.</div>`;
    setUpdated("loc", "—");
  });
}

init();
