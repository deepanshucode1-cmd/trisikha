import ReadyToShipOrders from '@/components/ReadyToShipOrders';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

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

  return <ReadyToShipOrders/>;

}
