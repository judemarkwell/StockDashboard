export interface StockData {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    marketCap?: number;
    volume?: number;
    lastUpdated: string;
  }
  
  export interface StockApiResponse {
    stocks: StockData[];
    error?: string;
  }