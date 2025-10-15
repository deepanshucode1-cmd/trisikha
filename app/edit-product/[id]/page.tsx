import ProductDetail from '@/components/ProductDetail'
import React from 'react'
import  PageProps, { NextPage }  from 'next/types'
import EditProduct from '@/components/EditProduct';

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
        <EditProduct id={id}/> 
    </div>
  )
}

export default page