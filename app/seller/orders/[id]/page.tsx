import SellerOrderDetails from '@/components/SellerOrdersPage';
import { NextPage } from 'next';
import React from 'react'

interface PageProps {
  params: Promise<{
        id: string;
  }>;
}

const  page : NextPage<PageProps> = async ({ params }) => {


    const resolvedParams = await params;
    const { id } = resolvedParams;
    
  return (
    <div>
        <SellerOrderDetails params={id}/> 
    </div>
  )
}

export default page