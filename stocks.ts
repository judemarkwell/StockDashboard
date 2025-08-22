// api/stocks.ts (Vercel Serverless Function)
// Node 18+ has fetch globally.
// GET /api/stocks?symbols=AAPL,MSFT,GOOGL

import { z } from "zod";

const FINN_KEY = process.env.FINNHUB_KEY;
const AV_KEY = process.env.ALPHA_VANTAGE_KEY;

const Query = z.object({
  symbols: z.string().optional(),
});

type StockData = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  volume?: number;
  lastUpdated: string;
};
type StockApiResponse = { stocks: StockData[]; error?: string };

const MOCK_PRESETS: Record<string, { price: number; cap: number; vol: number }> = {
  AAPL: { price: 230.12, cap: 3.55e12, vol: 58_000_000 },
  MSFT: { price: 430.34, cap: 3.2e12, vol: 29_000_000 },
  GOOGL:{ price: 168.77, cap: 2.1e12, vol: 26_000_000 },
  AMZN: { price: 178.45, cap: 1.85e12, vol: 41_200_000 },
  NVDA: { price: 121.65, cap: 2.9e12, vol: 52_400_000 },
  TSLA: { price: 249.02, cap: 0.77e12, vol: 95_000_000 },
  META: { price: 512.22, cap: 1.3e12, vol: 19_000_000 },
};
const defaultSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];

function uniqueSymbols(syms?: string): string[] {
  const arr = (syms ?? defaultSymbols.join(","))
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(arr));
}

function mockData(symbols: string[]): StockApiResponse {
  const rows: StockData[] = symbols.map((s, i) => {
    const base = MOCK_PRESETS[s] ?? { price: 100 + (i % 7) * 7, cap: 1e11, vol: 5_000_000 + i * 150_000 };
    const t = Math.floor(Date.now() / 60_000);
    const r = Math.sin(i * 997 + t) * 0.5 + 0.5; // 0..1
    const pct = r * 6 - 3; // -3..+3%
    const price = +(base.price * (1 + pct / 100)).toFixed(2);
    const changePercent = +pct.toFixed(2);
    const change = +((price * changePercent) / 100).toFixed(2);
    const volume = Math.max(1, Math.round(base.vol * (0.8 + r * 0.4)));
    return {
      symbol: s,
      price,
      change,
      changePercent,
      marketCap: Math.round(base.cap),
      volume,
      lastUpdated: new Date().toISOString(),
    };
  });
  return { stocks: rows, error: "Using mock data (provider unavailable or rate-limited)." };
}

// ---------- Finnhub ----------
async function finnhubQuote(symbol: string, token: string): Promise<StockData | null> {
  const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`);
  const d = await q.json();
  if (!d || typeof d.c !== "number") return null;
  const profileRes = await fetch(
    `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${token}`
  );
  const p = await profileRes.json().catch(() => ({}));
  const cap = typeof p?.marketCapitalization === "number" ? p.marketCapitalization * 1e9 : undefined;
  const prevClose = typeof d.pc === "number" ? d.pc : 0;
  const change = typeof d.d === "number" ? d.d : d.c - prevClose;
  const changePercent =
    typeof d.dp === "number" ? d.dp : prevClose ? (change / prevClose) * 100 : 0;
  return {
    symbol,
    price: d.c,
    change,
    changePercent,
    marketCap: cap,
    volume: typeof d.v === "number" ? d.v : undefined,
    lastUpdated: new Date().toISOString(),
  };
}

// ---------- Alpha Vantage ----------
async function alphaVantageQuote(symbol: string, key: string): Promise<StockData | null> {
  const r = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`
  );
  const j = await r.json();
  if (j?.Note) return null;
  const g = j?.["Global Quote"];
  if (!g) return null;
  const num = (x?: string) =>
    x == null ? undefined : Number(String(x).replace(/[,%]/g, "").replace(/,/g, ""));
  const price = num(g["05. price"]);
  const change = num(g["09. change"]);
  const changePercent = num(g["10. change percent"]);
  const volume = num(g["06. volume"]);
  if (price == null || change == null || changePercent == null) return null;

  let cap: number | undefined;
  // Light cap enrichment (best effort, no more than 1 extra call per symbol)
  const o = await fetch(
    `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${key}`
  ).then((r2) => r2.json()).catch(() => ({}));
  if (!o?.Note) {
    const c = num(o?.MarketCapitalization);
    if (typeof c === "number") cap = c;
  }

  const latestDay = g["07. latest trading day"];
  const lastUpdated =
    latestDay && !Number.isNaN(Date.parse(latestDay))
      ? new Date(`${latestDay}T16:00:00Z`).toISOString()
      : new Date().toISOString();

  return {
    symbol,
    price,
    change,
    changePercent,
    marketCap: cap,
    volume,
    lastUpdated,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60"); // CDN cache

  const parsed = Query.safeParse(req.query);
  const symbols = uniqueSymbols(parsed.success ? parsed.data.symbols : undefined);

  // Prefer Finnhub if key present, else Alpha Vantage, else mock
  const useFinn = Boolean(FINN_KEY);
  const useAV = Boolean(AV_KEY);

  async function fromFinnhub(): Promise<StockApiResponse> {
    const out: StockData[] = [];
    for (const s of symbols) {
      const row = await finnhubQuote(s, FINN_KEY as string).catch(() => null);
      if (row) out.push(row);
    }
    return out.length ? { stocks: out } : { stocks: [], error: "Finnhub unavailable." };
  }

  async function fromAV(): Promise<StockApiResponse> {
    const out: StockData[] = [];
    for (const s of symbols) {
      const row = await alphaVantageQuote(s, AV_KEY as string).catch(() => null);
      if (row) out.push(row);
    }
    return out.length ? { stocks: out } : { stocks: [], error: "Alpha Vantage unavailable." };
  }

  let resp: StockApiResponse;
  if (useFinn) {
    resp = await fromFinnhub();
    if (!resp.stocks.length && useAV) resp = await fromAV();
    if (!resp.stocks.length) resp = mockData(symbols);
  } else if (useAV) {
    resp = await fromAV();
    if (!resp.stocks.length) resp = mockData(symbols);
  } else {
    resp = mockData(symbols);
  }

  res.status(200).json(resp);
}
