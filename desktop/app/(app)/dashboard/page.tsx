'use client';

import { ShoppingCart, Receipt, Package, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';

/**
 * Phase-1 dashboard: proves the authenticated shell renders and the session is
 * available. KPI cards are placeholders — they are wired to
 * `/v1/analytics/dashboard` in Phase 5.
 */
const KPIS = [
  { label: "Today's Sales", icon: ShoppingCart },
  { label: 'Transactions', icon: Receipt },
  { label: 'Low Stock Items', icon: Package },
  { label: 'Pending Sync', icon: RefreshCw }
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{user?.first_name ? `, ${user.first_name}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Store {user?.store_id} · {user?.branch_name ?? 'All branches'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation ready</CardTitle>
          <CardDescription>
            Auth, offline store, network detection, and the shared business logic
            are wired up. Core POS (product search, cart, checkout, offline sales
            and sync) arrives in Phase 2.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
