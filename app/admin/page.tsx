import DashboardClient from '@/components/DashboardClient';
import DashboardNav from '@/components/DashboardNav';
import ReadyToShipOrders from '@/components/ReadyToShipOrders';
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

  const { data: userProfile, error } = await supabase
    .from('user_role')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error !== null || !userProfile || !userProfile.role || userProfile.role !== 'admin') {
    redirect('/login');
  }

  return <DashboardNav />;

}
