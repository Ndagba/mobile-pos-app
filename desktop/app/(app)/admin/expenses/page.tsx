'use client';

import React from 'react';
import Link from 'next/link';
import { PlusCircle, Tags, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ExpenseHubPage() {
  const expenseModules = [
    {
      title: 'Record Expense',
      description: 'Log new business expenditures and track spending.',
      href: '/admin/expenses/record',
      icon: PlusCircle,
      color: 'text-emerald-500',
    },
    {
      title: 'Manage Categories',
      description: 'Organize and customize your expense heads and categories.',
      href: '/admin/expenses/categories',
      icon: Tags,
      color: 'text-blue-500',
    },
    {
      title: 'Expense Reports',
      description: 'Analyze spending patterns and generate financial reports.',
      href: '/admin/expenses/reports',
      icon: BarChart3,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {expenseModules.map((module) => (
        <Link key={module.href} href={module.href}>
          <Card className="h-full transition-all hover:ring-2 hover:ring-primary hover:shadow-md group cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className={`p-3 rounded-lg bg-muted ${module.color}`}>
                <module.icon className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg group-hover:text-primary transition-colors">
                {module.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {module.description}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
