export interface DashboardData {
  transaction_count: number;
  total_revenue: number;
  avg_transaction: number;
  total_items_sold: number;
  weekly_revenue: number;
  low_stock_count: number;
  total_profit: number;
  profit_margin: number;
  payment_breakdown: Array<{
    method: string;
    count: number;
    total: number;
  }>;
  top_products: Array<{
    id: string;
    name: string;
    sku: string;
    total_sold: number;
    total_revenue: number;
  }>;
  recent_transactions: Array<{
    id: string;
    total_amount: number;
    payment_method: string;
    status: string;
    created_at: string;
    cashier: string;
    item_count: number;
  }>;
}
