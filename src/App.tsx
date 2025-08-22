import { useEffect, useMemo, useState } from "react";
import StockTable from "./components/StockTable";
import type { StockData, StockApiResponse } from "./types";
import { fetchStocks } from "./api";
import { RefreshCcw} from "lucide-react";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];

type SortKey = "symbol" | "price" | "change" | "changePercent" | "marketCap" | "volume";
type SortDir = "asc" | "desc";

export default function App() {
  const [symbols, setSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("symbols");
      return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    } catch {
      return DEFAULT_SYMBOLS;
    }
  });

  const [rows, setRows] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  
  useEffect(() => {
    localStorage.setItem("symbols", JSON.stringify(symbols));
  }, [symbols]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const resp: StockApiResponse = await fetchStocks(symbols);
      setRows(resp.stocks ?? []);
      if (resp.error) setError(resp.error);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch stock data. Showing mock data.");
      // last-resort: build a tiny mock client-side if API threw hard
      const mocks = symbols.map((s, i) => ({
        symbol: s,
        price: 100 + i * 5,
        change: (Math.random() - 0.5) * 5,
        changePercent: +(Math.random() * 6 - 3).toFixed(2),
        marketCap: 1e11 + i * 5e9,
        volume: 5_000_000 + i * 250_000,
        lastUpdated: new Date().toISOString(),
      }));
      setRows(mocks);
    } finally {
      setLoading(false);
    }
  }

  // Fetch once on boot
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add symbol triggers a fetch explicitly
  const addSymbol = async () => {
    const s = query.trim().toUpperCase();
    if (!s || symbols.includes(s)) return;
    const next = [...symbols, s].slice(0, 16);
    setSymbols(next);
    setQuery("");
    await load();
  };

  // Sorting
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  // Derived
  const lastUpdated = useMemo(() => {
    if (!rows.length) return null;
    const ts = Math.max(...rows.map((s) => (s.lastUpdated ? Date.parse(s.lastUpdated) : 0)));
    return ts ? new Date(ts) : null;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let arr = rows;
    if (q) arr = rows.filter((x) => x.symbol.toUpperCase().includes(q));

    const pick = (s: StockData, k: SortKey): string | number => {
      switch (k) {
        case "symbol": return s.symbol;
        case "price": return s.price ?? Number.NEGATIVE_INFINITY;
        case "change": return s.change ?? Number.NEGATIVE_INFINITY;
        case "changePercent": return s.changePercent ?? Number.NEGATIVE_INFINITY;
        case "marketCap": return s.marketCap ?? Number.NEGATIVE_INFINITY;
        case "volume": return s.volume ?? Number.NEGATIVE_INFINITY;
      }
    };

    return [...arr].sort((a, b) => {
      const A = pick(a, sortKey);
      const B = pick(b, sortKey);
      if (A < B) return sortDir === "asc" ? -1 : 1;
      if (A > B) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, query, sortKey, sortDir]);

  const mockMode = !!error && /mock|limit/i.test(error ?? "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-sky-100 to-sky-300">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Topbar */}
        <div className="flex items-center justify-end mb-4">
          
        </div>

        {/* Hero */}
        <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-500 via-pink-500 to-red-500">
            Stock Market Dashboard
          </h1>
          <p className="mt-2 text-base-content/70">Quotes with search, sorting, and manual refresh.</p>
        </div>

        {/* Card */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="card-title">📈 Stock Dashboard</h2>
                {mockMode && <div className="badge badge-warning">Mock Fallback</div>}
              </div>
              <div className="text-xs opacity-60">
                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : loading ? "Fetching…" : "—"}
              </div>
            </div>

            {error && (
              <div className="alert alert-warning text-sm">
                <span>{error}</span>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <input
                className="input input-bordered w-full sm:max-w-xs"
                placeholder="Search or add symbol (e.g., TSLA)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSymbol()}
              />
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={addSymbol} disabled={!query.trim()}>
                  Add
                </button>
                <button className="btn gap-2" onClick={load} disabled={loading}>
                  <RefreshCcw size={14} />
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {/* Table */}
            <StockTable data={filtered} loading={loading} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />

            <div className="text-center text-xs opacity-60">
              Manual refresh • Free API tier with graceful mock fallback
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
