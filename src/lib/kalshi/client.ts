import { signRequest } from "./auth";
import type {
  KalshiMarket,
  KalshiMarketsResponse,
  KalshiMarketResponse,
  KalshiEventsResponse,
} from "./types";

const DEMO_HOST = "https://demo-api.kalshi.co/trade-api/v2";
const LIVE_HOST = "https://api.elections.kalshi.com/trade-api/v2";

export class KalshiClient {
  private apiHost: string;
  private apiKeyId: string;
  private privateKey: string;
  private isDemo: boolean;

  constructor() {
    this.apiKeyId = process.env.KALSHI_API_KEY_ID ?? "";
    this.privateKey = process.env.KALSHI_PRIVATE_KEY ?? "";
    this.isDemo = (process.env.KALSHI_DEMO ?? "true").toLowerCase() === "true";
    this.apiHost = this.isDemo ? DEMO_HOST : LIVE_HOST;
  }

  get simulating(): boolean {
    return !this.apiKeyId || !this.privateKey;
  }

  private getHeaders(method: string, endpoint: string): Record<string, string> {
    if (this.simulating) {
      return { "Content-Type": "application/json" };
    }
    const fullPath = "/trade-api/v2" + endpoint;
    return signRequest(this.privateKey, this.apiKeyId, method, fullPath) as unknown as Record<string, string>;
  }

  private async request<T>(method: string, endpoint: string): Promise<T | null> {
    const url = this.apiHost + endpoint;
    const headers = this.getHeaders(method, endpoint);

    try {
      const res = await fetch(url, {
        method,
        headers,
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Kalshi ${method} ${endpoint}: HTTP ${res.status} — ${body.slice(0, 200)}`);
        return null;
      }

      return (await res.json()) as T;
    } catch (err) {
      console.error(`Kalshi ${method} ${endpoint}: ${err}`);
      return null;
    }
  }

  async getMarket(ticker: string): Promise<KalshiMarket | null> {
    const resp = await this.request<KalshiMarketResponse>("GET", `/markets/${ticker}`);
    return resp?.market ?? null;
  }

  async getMarkets(params?: {
    event_ticker?: string;
    series_ticker?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<KalshiMarketsResponse | null> {
    const searchParams = new URLSearchParams();
    if (params?.event_ticker) searchParams.set("event_ticker", params.event_ticker);
    if (params?.series_ticker) searchParams.set("series_ticker", params.series_ticker);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    const endpoint = `/markets${query ? `?${query}` : ""}`;
    return this.request<KalshiMarketsResponse>("GET", endpoint);
  }

  async getEvents(params?: {
    series_ticker?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<KalshiEventsResponse | null> {
    const searchParams = new URLSearchParams();
    if (params?.series_ticker) searchParams.set("series_ticker", params.series_ticker);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    const endpoint = `/events${query ? `?${query}` : ""}`;
    return this.request<KalshiEventsResponse>("GET", endpoint);
  }

  async getAllWeatherMarkets(): Promise<KalshiMarket[]> {
    const allMarkets: KalshiMarket[] = [];
    let cursor: string | undefined;

    do {
      const resp = await this.getMarkets({
        series_ticker: "KXHIGHNY",
        // Kalshi GET /markets only accepts unopened | open | closed | settled — not "active"
        status: "open",
        cursor,
        limit: 100,
      });

      if (!resp) break;
      allMarkets.push(...resp.markets);
      cursor = resp.cursor || undefined;
    } while (cursor);

    return allMarkets;
  }
}
