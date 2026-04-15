import type { OpenMeteoResponse, WeatherForecast } from "./types";
import { getCityConfig } from "@/lib/config";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

export async function fetchWeatherForecast(cityKey: string): Promise<WeatherForecast> {
  const { cityCoords, timezone } = getCityConfig(cityKey);

  const params = new URLSearchParams({
    latitude: cityCoords.latitude.toString(),
    longitude: cityCoords.longitude.toString(),
    daily: "temperature_2m_max",
    hourly: "temperature_2m",
    temperature_unit: "fahrenheit",
    timezone,
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
    utcOffsetSeconds: data.utc_offset_seconds ?? 0,
    rawResponse: data,
  };
}

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/**
 * Fetch the actual observed high temperature for a past date.
 * Returns null on any failure so callers can degrade gracefully.
 */
export async function fetchActualHighTemperature(
  date: string,
  cityKey: string
): Promise<number | null> {
  try {
    const { cityCoords, timezone } = getCityConfig(cityKey);

    const params = new URLSearchParams({
      latitude: cityCoords.latitude.toString(),
      longitude: cityCoords.longitude.toString(),
      start_date: date,
      end_date: date,
      daily: "temperature_2m_max",
      temperature_unit: "fahrenheit",
      timezone,
    });

    const res = await fetch(`${ARCHIVE_URL}?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      daily?: { temperature_2m_max?: number[] };
    };

    const temp = data.daily?.temperature_2m_max?.[0];
    return typeof temp === "number" && Number.isFinite(temp) ? temp : null;
  } catch {
    return null;
  }
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
