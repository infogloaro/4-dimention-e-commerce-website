export type StoreProduct = {
  id: number | string;
  name: string;
  category: string;
  categoryName: string;
  price: number;
  old: number;
  discount: number;
  rating: string | null;
  reviewCount: number;
  description: string;
  stock: number;
  tag: string;
  available: boolean;
  image: string;
  images: string[];
  brand: string | null;
  specifications: Record<string, string>;
  tone: string;
};

type ApiReview = {
  rating: number;
  comment: string;
  date: string;
  reviewerName: string;
  reviewerEmail: string;
};

type ApiProduct = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  thumbnail: string;
  brand?: string;
  images?: string[];
  reviews?: ApiReview[];
  warrantyInformation?: string;
  shippingInformation?: string;
  returnPolicy?: string;
  dimensions?: { width: number; height: number; depth: number };
  weight?: number;
  sku?: string;
  minimumOrderQuantity?: number;
}

const productCategories = ["smartphones", "laptops", "tablets", "mobile-accessories"];

const categoryNames: Record<string, string> = {
  smartphones: "Smartphones",
  laptops: "Laptops & ultrabooks",
  tablets: "Tablets & e-readers",
  "mobile-accessories": "Mobile accessories",
};

function isApiProduct(value: unknown): value is ApiProduct {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "number" &&
    "title" in value && typeof value.title === "string" &&
    "description" in value && typeof value.description === "string" &&
    "category" in value && typeof value.category === "string" &&
    "price" in value && typeof value.price === "number" &&
    "discountPercentage" in value && typeof value.discountPercentage === "number" &&
    "rating" in value && typeof value.rating === "number" &&
    "stock" in value && typeof value.stock === "number" &&
    "thumbnail" in value && typeof value.thumbnail === "string";
}

function specificationsFor(product: ApiProduct): Record<string, string> {
  const specifications: Record<string, string> = {};

  if (product.dimensions) {
    const { width, height, depth } = product.dimensions;
    specifications["Dimensions"] = `${width} × ${height} × ${depth} cm`;
  }
  if (product.weight !== undefined) specifications["Weight"] = `${product.weight} kg`;
  if (product.warrantyInformation) specifications["Warranty"] = product.warrantyInformation;
  if (product.shippingInformation) specifications["Shipping"] = product.shippingInformation;
  if (product.returnPolicy) specifications["Return policy"] = product.returnPolicy;
  if (product.minimumOrderQuantity !== undefined) {
    specifications["Minimum order quantity"] = String(product.minimumOrderQuantity);
  }
  if (product.sku) specifications["SKU"] = product.sku;

  return specifications;
}

function mapProduct(product: ApiProduct): StoreProduct {
  const originalPrice = product.discountPercentage < 100
    ? product.price / (1 - product.discountPercentage / 100)
    : product.price;
  const images = Array.from(new Set([product.thumbnail, ...(product.images ?? [])].filter(Boolean)));

  return {
    id: product.id,
    name: product.title,
    category: product.category,
    categoryName: categoryNames[product.category] ?? product.category,
    price: product.price,
    old: originalPrice,
    discount: product.discountPercentage,
    rating: Number.isFinite(product.rating) ? product.rating.toFixed(1) : null,
    reviewCount: product.reviews?.length ?? 0,
    description: product.description,
    stock: product.stock,
    tag: product.stock > 0 ? "IN STOCK" : "SOLD OUT",
    available: product.stock > 0,
    image: product.thumbnail,
    images: images.length > 0 ? images : [product.thumbnail],
    brand: product.brand ?? null,
    specifications: specificationsFor(product),
    tone: "bg-[#e9e5df]",
  };
}

export async function fetchElectronicsProducts(signal: AbortSignal): Promise<StoreProduct[]> {
  const responses = await Promise.all(productCategories.map(async (category) => {
    const response = await fetch(`https://dummyjson.com/products/category/${category}?limit=100`, { signal });
    if (!response.ok) throw new Error(`DummyJSON request failed for ${category} (${response.status})`);

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("products" in payload) ||
      !Array.isArray((payload as { products: unknown[] }).products)
    ) {
      throw new Error(`DummyJSON returned an invalid response for ${category}`);
    }

    return (payload as { products: unknown[] }).products
      .filter(isApiProduct)
      .filter((product) => product.category === category);
  }));

  const products = Array.from(new Map(responses.flat().map((product) => [
    product.id,
    mapProduct(product),
  ])).values());

  if (products.length === 0) throw new Error("The product service returned no valid products");
  return products;
}
