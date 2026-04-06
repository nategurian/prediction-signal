/** Quote fields: newer Trade API responses use *_dollars (string or number, 0–1). Older/docs use cents (0–100) on yes_bid, yes_ask, etc. */
export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  status: string;
  category: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
  no_bid_dollars?: string | number;
  no_ask_dollars?: string | number;
  last_price?: number;
  last_price_dollars?: string | number;
  previous_price?: number;
  volume?: number;
  volume_fp?: string;
  open_interest?: number;
  close_time: string;
  expiration_time: string;
  settlement_timer_seconds: number;
  result: string;
  can_close_early: boolean;
  yes_sub_title: string;
  no_sub_title: string;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  series_ticker: string;
  markets: KalshiMarket[];
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor: string;
}

export interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor: string;
}

export interface KalshiMarketResponse {
  market: KalshiMarket;
}
