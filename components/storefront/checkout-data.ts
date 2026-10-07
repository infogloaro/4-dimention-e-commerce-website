export const CHECKOUT_STORAGE_KEY = "glotron-checkout";

export type CheckoutItem = {
  id: string;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
};

export function isCheckoutItem(value: unknown): value is CheckoutItem {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "name" in value && typeof value.name === "string" &&
    "image" in value && typeof value.image === "string" &&
    "unitPrice" in value && typeof value.unitPrice === "number" && Number.isFinite(value.unitPrice) && value.unitPrice >= 0 &&
    "quantity" in value && typeof value.quantity === "number" && Number.isInteger(value.quantity) && value.quantity > 0;
}
