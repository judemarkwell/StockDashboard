import type { StockData } from "../types";
import clsx from "clsx";

type SortKey = "symbol" | "price" | "change" | "changePercent" | "marketCap" | "volume";
type SortDir = "asc" | "desc";

type Props = {
  data: StockData[];
  loading: boolean;
  onSort?: (key: SortKey) => void;
  sortKey?: SortKey;
  sortDir?: SortDir;
};

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const fmtCompact = (n?: number) => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "K" },
  ];
  for (const u of units) if (abs >= u.v) return `${(n / u.v).toFixed(2)}${u.s}`;
  return n.toLocaleString();
};

export default function StockTable({ data, loading, onSort, sortKey, sortDir }: Props) {
  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => onSort?.(k)}
      title={`Sort by ${label}`}
      aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className="cursor-pointer select-none text-xs sm:text-sm font-semibold text-base-content/70 tracking-wide uppercase"
    >
      <div className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (
          <span className="text-[10px] opacity-60">{sortDir === "asc" ? "▲" : "▼"}</span>
        )}
      </div>
    </th>
  );

  const SkeletonRow = () => (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i}>
          <div className="skeleton h-4 w-20 rounded-md bg-base-300" />
        </td>
      ))}
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full rounded-box">
        <thead className="bg-base-200/70 text-base-content">
          <tr>
            <Th label="Symbol" k="symbol" />
            <Th label="Price" k="price" />
            <Th label="Change" k="change" />
            <Th label="Change %" k="changePercent" />
            <Th label="Market Cap" k="marketCap" />
            <Th label="Volume" k="volume" />
          </tr>
        </thead>

        <tbody className="text-sm sm:text-base divide-y divide-base-200">
          {loading && data.length === 0
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            : data.map((s) => {
                const up = (s.change ?? 0) >= 0;
                return (
                  <tr
                    key={s.symbol}
                    className={clsx(
                      "hover:bg-base-200/50 transition-all duration-150",
                      "hover:-translate-y-[1px] transform-gpu hover:drop-shadow-sm"
                    )}
                  >
                    <td className="font-bold">{s.symbol}</td>
                    <td>{fmtUSD.format(s.price)}</td>
                    <td className={clsx("font-medium", up ? "text-success" : "text-error")}>
                      {up ? "+" : ""}
                      {s.change.toFixed(2)}
                    </td>
                    <td className={clsx("font-medium", up ? "text-success" : "text-error")}>
                      {up ? "+" : ""}
                      {s.changePercent.toFixed(2)}%
                    </td>
                    <td>{fmtCompact(s.marketCap)}</td>
                    <td>{fmtCompact(s.volume)}</td>
                  </tr>
                );
              })}

          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-4 text-base-content/60">
                No data yet. Add or search for a symbol above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
