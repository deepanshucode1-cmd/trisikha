import ProductDetail from '@/components/ProductDetail'
import React from 'react'
import  PageProps, { NextPage }  from 'next/types'
import EditProduct from '@/components/EditProduct';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
        id: string;
  }>;
}

const  page : NextPage<PageProps> = async ({ params }) => {

    const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
    
      if (!user) {
        redirect('/login');
      }
    

    const resolvedParams = await params;
    const { id } = resolvedParams;
    
  return (
    <div>
        <EditProduct id={id}/> 
    </div>
  )
}

export default page