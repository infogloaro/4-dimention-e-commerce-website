/** Shapes of the JSON the storefront reads. They mirror the server read-models (server/services/**); money is integer minor units. */

export interface ImageRef { url: string; thumbnailUrl?: string | null; alt: string; width?: number | null; height?: number | null }

export interface ProductPrice { price: number; compareAtPrice: number | null; discountAmount: number; discountPercent: number; onSale: boolean; from: boolean; min: number; max: number }

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string };
  image: ImageRef | null;
  hoverImage: { url: string; alt: string } | null;
  price: ProductPrice;
  rating: { average: number; count: number };
  badges: { key: string; label: string }[];
  inStock: boolean;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  hasVariants: boolean;
  defaultVariantId: string | null;
  swatches: { value: string; swatch: string | null }[];
  isFeatured: boolean;
  createdAt: string;
}

export interface FacetValue { id?: string; slug?: string; name?: string; count: number; selected: boolean }
export interface ListingMeta {
  page: number; pageSize: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean;
  sort: string; query: string | null;
  facets?: { brands?: FacetValue[]; categories?: FacetValue[]; priceRange?: { min: number; max: number } | null; availability?: { inStock: number; outOfStock: number } };
  emptyState?: { message: string; popularProducts?: ProductCard[] };
}

export interface Category { id: string; parentId: string | null; name: string; slug: string; description: string | null; imageUrl: string | null; isFeatured: boolean; depth: number; children?: Category[]; productCount?: number }
export interface Brand { id: string; name: string; slug: string; productCount?: number }

export interface VariantDto {
  id: string; sku: string; name: string | null; isDefault: boolean;
  price: { price: number; compareAtPrice: number | null; discountPercent: number; onSale: boolean };
  weightGrams: number;
  options: Record<string, string>;
  availability: { status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK"; inStock: boolean; available: number; maxPurchasable: number; lowStock: boolean; message: string };
  mediaIds: string[];
}
export interface ProductDetail {
  id: string; slug: string; name: string; shortDescription: string | null; description: string | null; highlights: string[];
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string };
  breadcrumbs: { id: string; name: string; slug: string }[];
  badges: { key: string; label: string }[];
  media: { id: string; type: "IMAGE" | "VIDEO" | "MODEL_3D"; url: string; thumbnailUrl: string | null; alt: string; width: number | null; height: number | null; isPrimary: boolean; variantId: string | null }[];
  options: { key: string; name: string; values: { value: string; swatch: string | null; variantIds: string[]; available: boolean }[] }[];
  variants: VariantDto[];
  defaultVariantId: string | null;
  price: ProductPrice | null;
  inStock: boolean;
  maxQuantityPerOrder: number;
  taxRatePercent: number;
  pricesIncludeTax: boolean;
  specifications: { group: string; items: { name: string; value: string; unit: string | null }[] }[];
  rating: { average: number; count: number };
  offers: { code: string; description: string | null }[];
}

export interface CartLine {
  id: string; variantId: string; productId: string; slug: string; name: string; variantName: string | null; sku: string;
  brand: string | null; category: string; image: string | null; options: Record<string, string>;
  quantity: number; unitPrice: number; compareAtPrice: number | null;
  availability: { status: string; available: number; maxPurchasable: number };
  issues: { code: string; message: string }[];
  priceChanged: { from: number; to: number } | null;
  purchasable: boolean; lineSubtotal: number; discount: number; tax: number; lineTotal: number; savings: number;
}
export interface Pricing {
  pricesIncludeTax: boolean; itemCount: number; mrpTotal: number; subtotal: number; mrpSavings: number; couponDiscount: number; discountedSubtotal: number;
  shippingFee: number; shippingDiscount: number; shippingTotal: number; taxTotal: number; grandTotal: number; totalSavings: number; freeShippingRemaining: number | null;
  appliedCoupons: { code: string; discount: number; shippingDiscount: number; description?: string | null }[];
}
export interface ShippingOption { code: string; name: string; carrier: string | null; description: string | null; fee: number; freeAboveSubtotal: number | null; minDays: number; maxDays: number; estimatedDelivery: { earliest: string; latest: string } }
export interface Cart {
  id: string | null; items: CartLine[]; savedForLater: CartLine[]; pricing: Pricing;
  coupons: { applied: Pricing["appliedCoupons"]; rejected: { code: string; message: string }[]; available: { code: string; description: string | null; minSubtotal: number }[] };
  shipping: { selected: ShippingOption | null; options: ShippingOption[] };
  issues: { code: string; message: string }[]; itemCount: number; pricesIncludeTax: boolean;
}

export interface Me { id: string; name: string; email: string; phone: string | null; role: string; isStaff: boolean; emailVerified: boolean; permissions?: string[] }

export interface Address { id: string; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; postalCode: string; country: string; type: "HOME" | "WORK" | "OTHER"; isDefault: boolean }
export interface AddressInput { fullName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; postalCode: string; country?: string; type?: "HOME" | "WORK" | "OTHER"; isDefault?: boolean }

export interface CheckoutValidation {
  valid: boolean;
  items: CartLine[];
  pricing: Pricing;
  shipping: { selected: ShippingOption | null; options: ShippingOption[] };
  coupons: { applied: Pricing["appliedCoupons"]; rejected: { code: string; message: string }[] };
  issues: { code: string; message: string }[];
  paymentMethods: { code: "ONLINE" | "COD"; provider?: string; available: boolean; note?: string }[];
  reservationMinutes: number;
}

export interface OrderItem {
  id: string; productId: string | null; variantId: string | null; sku: string; name: string; variantName: string | null; brand: string | null; imageUrl: string | null;
  attributes: Record<string, string>; quantity: number; unitPrice: number; discountAmount: number; taxAmount: number; lineTotal: number;
  cancelledQuantity: number; returnedQuantity: number; returnableQuantity: number;
}
export interface TrackingEvent { id: string; code: string; title: string; description: string | null; location: string | null; occurredAt: string; shipmentId: string | null }
export interface ShipmentView { id: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null; estimatedDelivery: string | null; deliveredAt: string | null; items: { orderItemId: string; quantity: number }[] }
export interface ProgressStage { status: string; label: string; description: string; at: string | null; state: "completed" | "current" | "upcoming" | "skipped" }
export interface OrderAddress { fullName: string; phone: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; postalCode: string; country: string }
export interface Order {
  id: string; orderNumber: string; invoiceNumber: string | null; status: string; statusLabel: string; paymentStatus: string; currency: string; placedAt: string | null; createdAt: string;
  totals: { subtotal: number; discount: number; shipping: number; tax: number; grandTotal: number; refunded: number; pricesIncludeTax: boolean };
  items: OrderItem[];
  shippingAddress: OrderAddress | null;
  shipping: { method: string; details?: { name?: string; carrier?: string }; estimatedDelivery: { min: string | null; max: string | null } } | null;
  coupon: { code?: string }[] | null;
  payments: { id: string; provider: string; method: string; status: string; amount: number; paidAt: string | null; failureReason: string | null; createdAt: string }[];
  refunds: { id: string; amount: number; status: string; reason: string | null; processedAt: string | null; createdAt: string }[];
  returns: { id: string; number: string; status: string; createdAt: string }[];
  cancelReason: string | null;
  tracking: { status: string; progress: ProgressStage[]; events: TrackingEvent[]; shipments: ShipmentView[]; estimatedDelivery: { min: string | null; max: string | null } };
  actions: { canCancel: boolean; canReturn: boolean; returnWindowEndsAt: string | null; canReview: boolean; canPay: boolean; canDownloadInvoice: boolean };
}
export interface OrderSummary {
  id: string; orderNumber: string; status: string; statusLabel: string; paymentStatus: string; placedAt: string; grandTotal: number; currency: string; itemCount: number;
  preview: { id: string; name: string; imageUrl: string | null; quantity: number; variantName: string | null }[];
  estimatedDelivery: { min: string | null; max: string | null };
  shipments: { status: string; trackingNumber: string | null; carrier: string | null }[];
}

export interface CheckoutResult {
  order: Order;
  payment: { id: string; provider: string; status: string; amount: number; clientPayload: Record<string, unknown> } | null;
  nextAction: "ORDER_CONFIRMED" | "COMPLETE_PAYMENT";
  reservationExpiresAt: string | null;
}
