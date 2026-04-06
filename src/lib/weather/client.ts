import type { OpenMeteoResponse, WeatherForecast } from "./types";
import { appConfig } from "@/lib/config";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

export async function fetchWeatherForecast(): Promise<WeatherForecast> {
  const { latitude, longitude } = appConfig.cityCoords;

  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    daily: "temperature_2m_max",
    hourly: "temperature_2m",
    temperature_unit: "fahrenheit",
    timezone: appConfig.timezone,
    forecast_days: "3",
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const data: OpenMeteoResponse = await res.json();

  const todayIndex = 0;
  const forecastedHigh = data.daily.temperature_2m_max[todayIndex];
  const forecastDate = data.daily.time[todayIndex];

  let currentTemp: number | null = null;
  const hourlyTemps: { time: string; temp: number }[] = [];

  if (data.hourly) {
    const now = new Date();
    const nowHour = now.toISOString().slice(0, 13);

    for (let i = 0; i < data.hourly.time.length; i++) {
      const hourTime = data.hourly.time[i];
      const temp = data.hourly.temperature_2m[i];
      hourlyTemps.push({ time: hourTime, temp });

      if (hourTime.startsWith(nowHour) || hourTime.slice(0, 13) === nowHour) {
        currentTemp = temp;
      }
    }

    if (currentTemp == null && data.hourly.temperature_2m.length > 0) {
      const closestIdx = findClosestHourIndex(data.hourly.time, now);
      currentTemp = data.hourly.temperature_2m[closestIdx];
    }
  }

  return {
    forecastedHigh,
    forecastDate,
    currentTemp,
    hourlyTemps,
    forecastTimestamp: new Date().toISOString(),
    rawResponse: data,
  };
}

function findClosestHourIndex(times: string[], target: Date): number {
  let closestIdx = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - target.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIdx = i;
    }
  }

  return closestIdx;
}
