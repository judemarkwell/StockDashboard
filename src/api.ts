import type { StockApiResponse, StockData } from "./types";


const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY as string | undefined;
const BASE = "https://www.alphavantage.co/query";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const num = (s?: string): number | undefined => {
  if (s == null) return undefined;
  const n = Number(String(s).replace(/[,%]/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
};

const rateLimited = (obj: any) => Boolean(obj?.Note) || Boolean(obj?.Information);

/* ---------------- Mock generator (stable minute jitter) ---------------- */
const MOCK_PRESETS: Record<string, { price: number; cap: number; vol: number }> = {
  AAPL: { price: 230.12, cap: 3.55e12, vol: 58_000_000 },
  MSFT: { price: 430.34, cap: 3.2e12, vol: 29_000_000 },
  GOOGL: { price: 168.77, cap: 2.1e12, vol: 26_000_000 },
  AMZN: { price: 178.45, cap: 1.85e12, vol: 41_200_000 },
  NVDA: { price: 121.65, cap: 2.9e12, vol: 52_400_000 },
  TSLA: { price: 249.02, cap: 0.77e12, vol: 95_000_000 },
  META: { price: 512.22, cap: 1.3e12, vol: 19_000_000 },
};

const jitter = (seed: number) => {
  const t = Math.floor(Date.now() / 60_000);
  const x = Math.sin(seed * 997 + t) * 10000;
  return x - Math.floor(x); // 0..1
};

const makeMockRow = (symbol: string, i: number): StockData => {
  const b =
    MOCK_PRESETS[symbol] ||
    { price: 100 + (i % 8) * 9, cap: 1e11 + i * 7e9, vol: 5_000_000 + i * 250_000 };
  const r = jitter(i + symbol.charCodeAt(0));
  const pct = r * 6 - 3; // -3..+3 %
  const price = +(b.price * (1 + pct / 100)).toFixed(2);
  const changePercent = +pct.toFixed(2);
  const change = +((price * changePercent) / 100).toFixed(2);
  const volume = Math.max(1, Math.round(b.vol * (0.85 + r * 0.3)));
  return {
    symbol,
    price,
    change,
    changePercent,
    marketCap: Math.round(b.cap),
    volume,
    lastUpdated: new Date().toISOString(),
  };
};

const buildMock = (symbols: string[]): StockData[] => {
  const uniq = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  return (uniq.length ? uniq : ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]).map(makeMockRow);
};

/* ---------------- Alpha Vantage: single quote ---------------- */
type GlobalQuoteResp = {
  ["Global Quote"]?: {
    ["01. symbol"]: string;
    ["05. price"]: string;
    ["06. volume"]: string;
    ["07. latest trading day"]: string;
    ["09. change"]: string;
    ["10. change percent"]: string;
  };
  Note?: string;
  Information?: string;
};

async function fetchQuote(symbol: string): Promise<StockData | null> {
  const url = `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as GlobalQuoteResp;

    if (rateLimited(data)) return null;

    const g = data["Global Quote"];
    if (!g || Object.keys(g).length === 0) return null;

    const price = num(g["05. price"]);
    const change = num(g["09. change"]);
    const changePercent = num(g["10. change percent"]); // like "1.23%"
    const volume = num(g["06. volume"]);

    if (price == null || change == null || changePercent == null) return null;

    const latestDay = g["07. latest trading day"];
    const lastUpdated =
      latestDay && !Number.isNaN(Date.parse(latestDay))
        ? new Date(`${latestDay}T16:00:00Z`).toISOString()
        : new Date().toISOString();

    return {
      symbol: g["01. symbol"] || symbol,
      price,
      change,
      changePercent,
      volume,
      lastUpdated,
    };
  } catch {
    return null;
  }
}

/* ---------------- Public API ---------------- */
export async function fetchStocks(inputSymbols: string[]): Promise<StockApiResponse> {
  const symbols = Array.from(new Set(inputSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));

  // If no key -> full mock
  if (!API_KEY) {
    return {
      stocks: buildMock(symbols),
      error: "No Alpha Vantage key found. Showing mock data.",
    };
  }

  const rows: StockData[] = [];
  const failed: string[] = [];

  // One shot per symbol (no auto refresh elsewhere)
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const row = await fetchQuote(sym);
    if (row) rows.push(row);
    else failed.push(sym);

    // small courtesy delay to avoid bursting (not a minute throttle)
    if (i < symbols.length - 1) await sleep(250);
  }

  if (rows.length === 0) {
    // Nothing usable → full mock
    return {
      stocks: buildMock(symbols),
      error: "Alpha Vantage daily limit reached or no data returned. Showing mock data.",
    };
  }

  if (failed.length > 0) {
    // Partial fallback
    const mocks = buildMock(failed);
    // preserve original order
    const merged = new Map<string, StockData>();
    for (const r of [...rows, ...mocks]) merged.set(r.symbol, r);
    return {
      stocks: symbols.map((s) => merged.get(s)!).filter(Boolean),
      error:
        "Some symbols could not be refreshed (likely rate limit). Mock data shown for those entries.",
    };
  }

  // All good
  return { stocks: rows };
}
