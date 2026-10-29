'use client';

import React from 'react';
import { redirect } from 'next/navigation';

export default function DashboardRedirect() {
  // Redirect all traffic from /dashboard to /admin/dashboard
  // to maintain a single source of truth for the "Elite Dashboard"
  redirect('/admin/dashboard');
  return null;
}
