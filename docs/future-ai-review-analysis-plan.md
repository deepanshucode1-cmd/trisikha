# Future Plan: AI-Powered Review Analysis (positiveNotes / negativeNotes)

## Context
Google supports `positiveNotes` and `negativeNotes` properties in Schema.org Product structured data. These render as pros/cons directly in Google search results and are highly valuable for GEO (Generative Engine Optimization).

## Approach
Use Claude Haiku via the Anthropic SDK to analyze accumulated reviews per product and extract common positive and negative themes.

## When to Implement
After the core review system has enough reviews to analyze (suggest: when any product reaches 5+ reviews).

## Design

### Database
Add to `products` table:
```sql
ALTER TABLE products
  ADD COLUMN positive_notes TEXT[] DEFAULT '{}',
  ADD COLUMN negative_notes TEXT[] DEFAULT '{}',
  ADD COLUMN notes_analyzed_at TIMESTAMPTZ DEFAULT NULL;
```

### Weekly Cron Addition
In the existing weekly review cron (`app/api/cron/send-review-emails/route.ts`) or a separate cron:
1. Find products where `review_count >= 5` AND (`notes_analyzed_at IS NULL` OR new reviews exist since last analysis)
2. Fetch all visible review texts for the product
3. Call Claude Haiku API with prompt:
   ```
   Analyze these product reviews for organic manure and extract:
   - Up to 5 most commonly mentioned positive aspects (pros)
   - Up to 5 most commonly mentioned negative aspects (cons)
   Return as JSON: { "positive": ["..."], "negative": ["..."] }
   Reviews: [review texts]
   ```
4. Parse response, store in `products.positive_notes` and `products.negative_notes`
5. Update `notes_analyzed_at`

### JSON-LD Integration
In the product page JSON-LD script, add:
```json
"positiveNotes": {
  "@type": "ItemList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Great quality" }
  ]
},
"negativeNotes": {
  "@type": "ItemList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Strong smell" }
  ]
}
```

### Cost Estimate
- Claude Haiku 4.5: ~$0.002 per product analysis
- 10 products analyzed weekly: ~$0.08/month
- 100 products: ~$0.80/month

### Dependencies
- `@anthropic-ai/sdk` npm package
- `ANTHROPIC_API_KEY` environment variable
