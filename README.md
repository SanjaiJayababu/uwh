## Cosmic Weather (Space theme)

Open `index.html` in a browser.

If your browser blocks API calls from `file://`, run a tiny local server instead:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

### What it does

- **Shows your current location weather first** (browser permission required)
- **Search any city** with autocomplete suggestions
- Shows **humidity**, **wind**, **cloud cover**, and **upcoming rain events**
- Shows **highest daily max temperature (last 30 years)** using Open‑Meteo Archive API
- Space UI with **floating animations** and a **spinning Earth** WebGL background

### APIs used

- **Forecast + current**: Open‑Meteo `api.open-meteo.com`
- **Geocoding**: Open‑Meteo `geocoding-api.open-meteo.com`
- **Historical daily max (10y)**: Open‑Meteo `archive-api.open-meteo.com`
- **Earth textures**: Three.js examples texture CDN

### Background music

The app includes a BGM player. Use **Set BGM URL** to paste an audio link you have permission to stream (mp3/ogg).

