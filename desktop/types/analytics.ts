export interface DashboardData {
  transaction_count: number;
  total_revenue: number;
  product_revenue?: number;
  service_revenue?: number;
  weekly_revenue?: number;
  avg_transaction: number;
  total_items_sold: number;
  total_profit: number;
  profit_margin: number;
  low_stock_count: number;
  payment_breakdown: Array<{
    method: string;
    total: number;
    count?: number;
  }>;
  top_products: Array<{
    id: string;
    name: string;
    sku?: string;
    total_sold?: number;
    total_revenue: number;
  }>;
  recent_transactions: Array<{
    id: string;
    total_amount: number;
    payment_method: string;
    status: string;
    item_count: number;
    cashier: string;
  }>;
}
