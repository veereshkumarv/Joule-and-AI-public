const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export async function geocodeLocation(location) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to geocode location "${location}": ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const match = data.results?.[0];

  if (!match) {
    throw new Error(`No location found matching "${location}". Try a more specific city name.`);
  }

  return {
    name: match.name,
    country: match.country,
    latitude: match.latitude,
    longitude: match.longitude,
  };
}

export async function getCurrentWeather(location) {
  const place = await geocodeLocation(location);

  const url = `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch weather for ${place.name}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const current = data.current;

  if (!current) {
    throw new Error(`No current weather data available for ${place.name}.`);
  }

  return {
    place: `${place.name}${place.country ? `, ${place.country}` : ""}`,
    temperatureC: current.temperature_2m,
    humidityPercent: current.relative_humidity_2m,
    windSpeedKmh: current.wind_speed_10m,
    condition: WEATHER_CODES[current.weather_code] ?? `Unknown (code ${current.weather_code})`,
  };
}
