export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  daily: {
    time: string[];
    temperature_2m_max: number[];
  };
  daily_units: {
    time: string;
    temperature_2m_max: string;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
  };
  hourly_units?: {
    time: string;
    temperature_2m: string;
  };
}

/** A single calendar-day high forecast (per-day slice of an Open-Meteo response). */
export interface DailyHighForecast {
  /** Local-zone calendar date of the forecast target, YYYY-MM-DD. */
  forecastDate: string;
  /** °F high for that target date. */
  forecastedHigh: number;
}

export interface WeatherForecast {
  /** Convenience: index-0 (today) high; equals dailyHighs[0].forecastedHigh. */
  forecastedHigh: number;
  /** Convenience: index-0 (today) date; equals dailyHighs[0].forecastDate. */
  forecastDate: string;
  /** Per-day high forecasts (today, today+1, ...) in city-local time. */
  dailyHighs: DailyHighForecast[];
  currentTemp: number | null;
  hourlyTemps: { time: string; temp: number }[];
  forecastTimestamp: string;
  /** Seconds east of UTC for the API response location (varies with DST). */
  utcOffsetSeconds: number;
  rawResponse: OpenMeteoResponse;
}

/** Per-day ensemble snapshot (member highs aggregated for a single target date). */
export interface DailyEnsembleForecast {
  forecastDate: string;
  ensembleMean: number;
  ensembleStdev: number;
  ensembleMin: number;
  ensembleMax: number;
  memberCount: number;
  memberHighs: number[];
}

export interface EnsembleForecast {
  /** Convenience: index-0 (today) values; equal to dailyEnsembles[0].*. */
  ensembleMean: number;
  ensembleStdev: number;
  ensembleMin: number;
  ensembleMax: number;
  memberCount: number;
  memberHighs: number[];
  forecastDate: string;
  /** Per-day ensemble forecasts (today, today+1, ...) in city-local time. */
  dailyEnsembles: DailyEnsembleForecast[];
}
