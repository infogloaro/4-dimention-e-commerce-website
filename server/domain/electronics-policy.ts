import { AppError } from "../core/errors";

/**
 * 4D Commerce — Four Dimension Electronics Policy & Taxonomy Guard.
 *
 * Enforces that 4D Commerce is strictly a consumer electronics e-commerce platform.
 * Prohibits unrelated categories (fashion, clothing, footwear, furniture, kitchenware,
 * groceries, skincare, cosmetics, tourism, etc.) from being created or published.
 */

export const PROHIBITED_CATEGORY_TERMS = [
  "fashion",
  "apparel",
  "clothing",
  "clothes",
  "footwear",
  "shoes",
  "sneakers",
  "dresses",
  "dress",
  "shirts",
  "shirt",
  "t-shirt",
  "trousers",
  "pants",
  "jeans",
  "denim",
  "kurta",
  "saree",
  "furniture",
  "sofa",
  "armchair",
  "desk",
  "chair",
  "mattress",
  "home-decor",
  "home & living",
  "home-living",
  "kitchen",
  "kitchenware",
  "cookware",
  "dutch oven",
  "tableware",
  "cosmetics",
  "skincare",
  "beauty",
  "makeup",
  "sunscreen",
  "serum",
  "groceries",
  "grocery",
  "food",
  "beverages",
  "tourism",
  "travel",
  "holiday",
  "hotel",
  "jewelry",
  "jewellery",
  "sports",
  "gym",
  "athletic",
  "lifestyle",
] as const;

export const VALID_ELECTRONICS_CATEGORIES = [
  "smartphones-tablets",
  "smartphones",
  "tablets",
  "e-readers",
  "laptops-computers",
  "laptops",
  "gaming-laptops",
  "desktops",
  "workstations",
  "computer-components",
  "processors-graphics",
  "processors",
  "graphics-cards",
  "storage-ram",
  "ram",
  "ssds",
  "hard-drives",
  "motherboards",
  "power-supplies",
  "pc-cabinets",
  "cooling-systems",
  "monitors-displays",
  "monitors",
  "gaming-monitors",
  "audio-sound",
  "audio",
  "headphones",
  "earbuds",
  "speakers",
  "soundbars",
  "gaming-consoles",
  "gaming",
  "consoles",
  "controllers",
  "gaming-accessories",
  "gaming-keyboards",
  "gaming-mice",
  "smart-wearables",
  "wearables",
  "smartwatches",
  "fitness-trackers",
  "cameras-photography",
  "cameras",
  "action-cameras",
  "drones",
  "camera-lenses",
  "televisions-entertainment",
  "televisions",
  "smart-tvs",
  "streaming-devices",
  "projectors",
  "networking",
  "routers",
  "mesh-wifi",
  "network-switches",
  "chargers-accessories",
  "accessories",
  "chargers",
  "cables",
  "power-banks",
  "docks-hubs",
  "electronics",
] as const;

export const STANDARD_ELECTRONICS_SPECS = [
  "processor",
  "chipset",
  "ram",
  "memory",
  "storage",
  "storage_type",
  "graphics",
  "display_size",
  "resolution",
  "refresh_rate",
  "display_type",
  "battery_capacity",
  "charging_speed",
  "battery_life",
  "connectivity",
  "cellular",
  "wifi",
  "bluetooth",
  "ports",
  "operating_system",
  "warranty_duration",
  "warranty_info",
  "condition",
  "dimensions",
  "weight_grams",
  "color",
] as const;

export const ALLOWED_PRODUCT_CONDITIONS = ["NEW", "BRAND NEW", "REFURBISHED", "OPEN_BOX"] as const;

/**
 * Checks if a string contains any prohibited non-electronics terms.
 */
export function containsProhibitedCategoryTerm(text: string): string | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  for (const term of PROHIBITED_CATEGORY_TERMS) {
    const termClean = term.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const regex = new RegExp(`\\b${termClean}\\b`, "i");
    if (regex.test(normalized)) {
      return term;
    }
  }
  return null;
}

/**
 * Throws AppError if category is not allowed in 4D Commerce.
 */
export function assertElectronicsCategory(name: string, slug?: string) {
  const matchName = containsProhibitedCategoryTerm(name);
  if (matchName) {
    throw new AppError(
      "NON_ELECTRONICS_CATEGORY_REJECTED",
      `Category '${name}' belongs to '${matchName}', which is not permitted. 4D Commerce is exclusively an electronics marketplace.`,
      { prohibitedTerm: matchName }
    );
  }
  if (slug) {
    const matchSlug = containsProhibitedCategoryTerm(slug);
    if (matchSlug) {
      throw new AppError(
        "NON_ELECTRONICS_CATEGORY_REJECTED",
        `Category slug '${slug}' contains prohibited term '${matchSlug}'. 4D Commerce is exclusively an electronics marketplace.`,
        { prohibitedTerm: matchSlug }
      );
    }
  }
}

/**
 * Validates that a product does not represent non-electronics merchandise.
 */
export function assertElectronicsProduct(name: string, description?: string, tags?: string[]) {
  const matchName = containsProhibitedCategoryTerm(name);
  if (matchName) {
    throw new AppError(
      "NON_ELECTRONICS_PRODUCT_REJECTED",
      `Product '${name}' appears to be '${matchName}', which is not permitted. 4D Commerce only sells legitimate consumer electronics.`,
      { prohibitedTerm: matchName }
    );
  }
  if (tags && tags.length) {
    for (const tag of tags) {
      const matchTag = containsProhibitedCategoryTerm(tag);
      if (matchTag) {
        throw new AppError(
          "NON_ELECTRONICS_PRODUCT_REJECTED",
          `Product tag '${tag}' indicates prohibited category '${matchTag}'. 4D Commerce only sells legitimate consumer electronics.`,
          { prohibitedTerm: matchTag }
        );
      }
    }
  }
}

/**
 * Validates electronics-specific attributes (e.g. condition, warranty duration).
 */
export function validateElectronicsAttributes(attributes: Array<{ key: string; value: string }>) {
  for (const attr of attributes) {
    if (attr.key === "condition") {
      const upper = attr.value.toUpperCase();
      const valid = ALLOWED_PRODUCT_CONDITIONS.some((c) => c === upper);
      if (!valid) {
        throw new AppError(
          "INVALID_PRODUCT_CONDITION",
          `Condition must be one of: ${ALLOWED_PRODUCT_CONDITIONS.join(", ")}`,
          { provided: attr.value }
        );
      }
    }
  }
}
