import ProductDetail from '@/components/ProductDetail'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { NextPage } from 'next/types'

interface PageProps {
  params: Promise<{
    product_id: string;
  }>;
}

const page: NextPage<PageProps> = async ({ params }) => {
  const resolvedParams = await params;
  const { product_id } = resolvedParams;

  if (!product_id) {
    notFound();
  }

  // Fetch product from database
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .single();

  if (error || !product) {
    notFound();
  }

  return (
    <ProductDetail
      id={product.id}
      name={product.name}
      price={product.price}
      image={product.image_url}
      description={product.description}
      weight={product.weight}
      stock={product.stock}
      sku={product.sku}
      hsn={product.hsn}
      countryOfOrigin={product.country_of_origin}
      manufacturerName={product.manufacturer_name}
      manufacturerAddress={product.manufacturer_address}
      netQuantity={product.net_quantity}
    />
  );
}

export default page
