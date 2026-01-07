import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AddProduct from '@/components/AddProduct';


const page = async () => {
      
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <AddProduct />;

}

export default page