'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { naira } from '@jaypos/shared';

interface FinancialOverviewProps {
  data: {
    grossIncome: number;
    operatingExpenses: number;
    netProfit: number;
  };
  showValues?: boolean;
}

export function FinancialQuickView({ data, showValues = true }: FinancialOverviewProps) {
  const format = (amount: number) => (showValues ? naira(amount) : '₦••••••');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Financial Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Gross Income</TableCell>
              <TableCell className="text-right tabular-nums">{format(data.grossIncome)}</TableCell>
            </TableRow>
            <TableRow className="text-destructive">
              <TableCell>Operating Expenses</TableCell>
              <TableCell className="text-right tabular-nums">{showValues ? `-${naira(data.operatingExpenses)}` : '-₦••••••'}</TableCell>
            </TableRow>
            <TableRow className="border-t-2 font-bold text-lg">
              <TableCell>Net Profit</TableCell>
              <TableCell className="text-right tabular-nums">{format(data.netProfit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
