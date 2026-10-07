# Catalogue, search & discovery

## Listing — `GET /products`
One endpoint powers catalogue, category pages, brand pages, collections, search results and "new arrivals".

| Param | Meaning |
|---|---|
| `q` | free text (see search below) |
| `category` | slug; **includes all subcategories** |
| `brand` | one or many slugs (`brand=a,b` or repeated) |
| `collection`, `tag` | slugs |
| `minPrice`, `maxPrice` | minor units; matches products whose price range overlaps |
| `minRating`, `minDiscount`, `inStock`, `productType`, `featured`, `bestseller`, `newArrival` | filters |
| `attr.<key>=a,b` | dynamic attribute filters, e.g. `attr.color=Black,Silver&attr.storage=256 GB` |
| `sort` | `relevance` (default; ranked search score when `q` is set, popularity otherwise) · `newest` · `price_asc` · `price_desc` · `rating` · `popularity` · `bestselling` · `discount` |
| `page`, `pageSize` | `pageSize` ≤ 100 (422 above), offset depth capped at 10 000 |
| `facets=false` | skip facet computation for lightweight / infinite-scroll requests |

Response: `data` = product **cards**; `meta` = `{page,pageSize,total,totalPages,hasNextPage,hasPreviousPage,sort,query,facets,emptyState}`.

**Card** (`ProductCard`): `id, slug, name, shortDescription, brand{id,name,slug}, category, image{url,thumbnailUrl,alt,width,height}, hoverImage, price{price,compareAtPrice,discountAmount,discountPercent,onSale,from,min,max}, rating{average,count}, badges[{key,label}] (max 3), inStock, stockStatus (IN_STOCK|LOW_STOCK|OUT_OF_STOCK), hasVariants, defaultVariantId, swatches[{value,swatch}], isFeatured, createdAt` — everything an animated card needs, no extra calls.

**Facets**: `brands[{id,name,slug,count,selected}]`, `categories[…]`, `priceRange{min,max}` (computed ignoring the price filter so sliders keep their bounds), `ratings[{min,count}]`, `discounts[{min,count}]`, `availability{inStock,outOfStock}`, `attributes[{key,name,values[{value,swatch,count,selected}]}]` (counts are distinct *products*, not variants). Brand facets ignore the brand filter so multi-select works.

**Empty results never dead-end:** `meta.emptyState = { message, categories[], popularProducts[] }`.

## Search
* Tokenised, all tokens must match. Each token matches as a substring **or** (≥4 chars) fuzzily via `pg_trgm` word-similarity → `headfones` finds *Headphones*.
* Matches name, brand, category chain, tags, attribute values, highlights and **SKU** (prefix).
* **Synonyms** (`SearchSynonym`, bidirectional): `phone ↔ smartphone/mobile`.
* Ranking: exact name > name prefix > name contains > SKU hit > similarity sum > mild popularity/rating prior.
* Queries are parameterised; `%`, `_`, `\` are escaped (injection tests included). Queries ≤100 chars, ≤6 tokens.
* `GET /search/suggest?q=` — lightweight autocomplete: top 6 **mini cards** (`id,slug,name,brand,image,price,compareAtPrice,inStock`), categories, brands, popular past queries, and `didYouMean` for typos. `GET /search/trending` — trending queries + categories for the empty search overlay. Recent searches are a client concern (localStorage).
* Full result pages log the query (`SearchLog`) to feed trending/suggestions.

## Product detail — `GET /products/:slug`
`id, slug, name, status, descriptions, highlights, brand, category, breadcrumbs[], tags[], badges[]`, `media[]` (ordered, typed IMAGE|VIDEO|MODEL_3D, per-variant `variantId`), **`options[{key,name,values[{value,swatch,available,variantIds}]}]`** (unavailable values stay listed with `available:false` — disabled, never silently removed), **`variants[{id,sku,name,isDefault,price{…},options{key:value},availability{status,inStock,available,maxPurchasable,lowStock,message},mediaIds}]`**, `price` (range + from-flag), `inStock`, `maxQuantityPerOrder`, `taxRatePercent`, `pricesIncludeTax`, `specifications[{group,items[{name,value,unit}]}]`, `rating{average,count,breakdown}`, `offers[]` (public coupons), `seo{title,description,keywords,canonicalUrl,ogImage}`, `structuredData` (schema.org Product/AggregateOffer JSON-LD). Cost price and internal fields are never exposed.

Companion calls: `POST /products/:slug/view` (feeds recently-viewed/popularity; fire after render), `GET /products/:slug/recommendations` (related + similar + frequently-bought-together in one request), `GET /products/:slug/reviews|questions`, `GET /products/compare?ids=a,b,c` (≤4), `GET /shipping/estimate?postalCode=` (delivery checker).

## Categories, brands, collections
`GET /categories` returns the **entire nested tree in one cached call** with roll-up product counts (mega-menus, rails). `GET /categories/:slug` adds breadcrumbs, filterable attributes and SEO. Brands/collections (scheduled windows honoured) mirror this. Collection products: `GET /products?collection=<slug>`.

## Recommendations (rule-based, swappable)
`server/services/recommendations.ts` — **related** (curated first, then same category scored by brand/tag overlap/popularity), **similar** (same category ±40 % price), **frequently bought together** (order co-occurrence SQL, falling back to curated accessories), **trending** (30-day sales, falling back to popularity), **personalised** (categories/brands from the viewer's history), **recently viewed** (≤30 per viewer, user or guest). Each returns product cards; an ML implementation can replace a function body without changing any route.

## Admin catalogue write path
`POST /admin/products` creates product + variants + options + inventory (+ initial stock movement) + media + specs + tags in **one transaction** and reindexes. Duplicate SKUs/slugs, unknown category/brand, `compareAtPrice < price` all fail atomically (tested). Price changes are audited (`product.price_changed`, old→new). Variants that were ever ordered are deactivated rather than deleted. Product delete = archive (soft). Bulk: publish, unpublish, archive, feature, set category, percentage price adjustment.
