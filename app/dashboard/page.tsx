import DashboardClient from '@/components/DashboardClient';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { useEffect, useState } from 'react';

export default async function Dashboard() {
    
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <DashboardClient />;

}
