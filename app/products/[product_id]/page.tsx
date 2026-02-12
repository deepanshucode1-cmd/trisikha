import ProductDetail from '@/components/ProductDetail'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

interface PageProps {
  params: Promise<{
    product_id: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { product_id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select('name, description, image_url, avg_rating, review_count')
    .eq('id', product_id)
    .single();

  if (!product) {
    return { title: 'Product Not Found' };
  }

  const description = product.review_count > 0
    ? `${product.name} — Rated ${product.avg_rating}/5 by ${product.review_count} verified buyers. ${product.description?.slice(0, 120) || ''}`
    : `${product.name} — ${product.description?.slice(0, 160) || 'Premium organic manure by Trishikha Organics'}`;

  return {
    title: `${product.name} | Trishikha Organics`,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.image_url ? [product.image_url] : [],
      type: 'website',
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { product_id } = await params;

  if (!product_id) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch product
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .single();

  if (error || !product) {
    notFound();
  }

  // SSR: Fetch first page of reviews
  const { data: reviews, count: reviewTotal } = await supabase
    .from('reviews')
    .select('id, rating, review_text, helpful_count, created_at', { count: 'exact' })
    .eq('product_id', product_id)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .limit(10);

  // Rating distribution for the bars
  const { data: allRatings } = await supabase
    .from('reviews')
    .select('rating')
    .eq('product_id', product_id)
    .eq('is_visible', true);

  const ratingDistribution = [0, 0, 0, 0, 0];
  if (allRatings) {
    for (const r of allRatings) {
      ratingDistribution[r.rating - 1]++;
    }
  }

  // Build JSON-LD structured data
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://trishikhaorganics.com';
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || '',
    image: product.image_url,
    sku: product.sku || undefined,
    brand: {
      '@type': 'Brand',
      name: 'Trishikha Organics',
    },
    offers: {
      '@type': 'Offer',
      price: String(product.price),
      priceCurrency: 'INR',
      availability: product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/products/${product.id}`,
    },
  };

  if (product.review_count > 0 && product.avg_rating) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(product.avg_rating),
      reviewCount: String(product.review_count),
      bestRating: '5',
      worstRating: '1',
    };
  }

  if (reviews && reviews.length > 0) {
    jsonLd.review = reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: String(r.rating),
        bestRating: '5',
      },
      ...(r.review_text ? { reviewBody: r.review_text } : {}),
      datePublished: new Date(r.created_at).toISOString().split('T')[0],
      author: {
        '@type': 'Person',
        name: 'Verified Buyer',
      },
    }));
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
        avgRating={product.avg_rating}
        reviewCount={product.review_count}
        initialReviews={reviews || []}
        initialReviewTotal={reviewTotal || 0}
        ratingDistribution={ratingDistribution}
      />
    </>
  );
}
