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

export interface WeatherForecast {
  forecastedHigh: number;
  forecastDate: string;
  currentTemp: number | null;
  hourlyTemps: { time: string; temp: number }[];
  forecastTimestamp: string;
  /** Seconds east of UTC for the API response location (varies with DST). */
  utcOffsetSeconds: number;
  rawResponse: OpenMeteoResponse;
}
