import ProductDetail from '@/components/ProductDetail'
import React from 'react'
import  PageProps, { NextPage }  from 'next/types'

interface PageProps {
  params: Promise<{
    product_id: string;
  }>;
}

const  page : NextPage<PageProps> = async ({ params }) => {

    const resolvedParams = await params;
    const { product_id } = resolvedParams;
    if(!product_id){
        return React.createElement('div', null, 'Product ID not found')
    }

    if(product_id === "trisikha-gold-1kg" ){
        return (
            <ProductDetail name="Trisikha Gold - 1kg" price="₹ 135" image="/product_detail.jpg"/>
        )
    }

    if(product_id === "trisikha-gold-5kg" ){
        return (
            <ProductDetail name="Trisikha Gold - 5kg" price="₹ 375" image="/product_detail.jpg"/>
        )
    }


  return (
    <div>Invalid Product ID</div>
  )
}

export default page