/**
 * Centralised error vocabulary. Every error returned to a client carries one of these codes,
 * so the frontend can switch on `error.code` instead of parsing messages.
 */
export const ERROR_STATUS = {
  // generic
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  CSRF_REJECTED: 403,
  // auth
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_DISABLED: 403,
  EMAIL_TAKEN: 409,
  PHONE_TAKEN: 409,
  INVALID_TOKEN: 400,
  EMAIL_NOT_VERIFIED: 403,
  WEAK_PASSWORD: 422,
  // catalog
  PRODUCT_NOT_FOUND: 404,
  VARIANT_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  BRAND_NOT_FOUND: 404,
  COLLECTION_NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  SKU_TAKEN: 409,
  CATEGORY_NOT_EMPTY: 409,
  CATEGORY_CYCLE: 422,
  // inventory
  OUT_OF_STOCK: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_STOCK_ADJUSTMENT: 422,
  // cart / checkout
  CART_EMPTY: 422,
  CART_ITEM_NOT_FOUND: 404,
  PRICE_CHANGED: 409,
  ITEM_UNAVAILABLE: 409,
  MAX_QUANTITY_EXCEEDED: 422,
  ADDRESS_NOT_FOUND: 404,
  ADDRESS_REQUIRED: 422,
  SHIPPING_UNAVAILABLE: 422,
  SHIPPING_METHOD_NOT_FOUND: 404,
  CHECKOUT_FAILED: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  REQUEST_IN_PROGRESS: 409,
  // coupons
  COUPON_NOT_FOUND: 404,
  COUPON_INVALID: 422,
  COUPON_EXPIRED: 422,
  COUPON_NOT_STARTED: 422,
  COUPON_USAGE_LIMIT: 422,
  COUPON_MIN_SUBTOTAL: 422,
  COUPON_NOT_APPLICABLE: 422,
  COUPON_NOT_STACKABLE: 422,
  COUPON_FIRST_ORDER_ONLY: 422,
  COUPON_CODE_TAKEN: 409,
  // wishlist
  WISHLIST_ITEM_NOT_FOUND: 404,
  // orders / payments
  ORDER_NOT_FOUND: 404,
  ORDER_STATE_INVALID: 409,
  ORDER_NOT_CANCELLABLE: 409,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_FAILED: 402,
  PAYMENT_STATE_INVALID: 409,
  PAYMENT_SIGNATURE_INVALID: 400,
  PAYMENT_PROVIDER_UNAVAILABLE: 503,
  WEBHOOK_SIGNATURE_INVALID: 401,
  REFUND_NOT_ALLOWED: 409,
  REFUND_EXCEEDS_PAID: 422,
  // returns
  RETURN_NOT_FOUND: 404,
  RETURN_NOT_ELIGIBLE: 422,
  RETURN_STATE_INVALID: 409,
  // reviews / Q&A
  REVIEW_NOT_FOUND: 404,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_STATE_INVALID: 409,
  QUESTION_NOT_FOUND: 404,
  // coupons/admin misc
  USER_NOT_FOUND: 404,
  ROLE_NOT_FOUND: 404,
  SYSTEM_ROLE_PROTECTED: 409,
  TICKET_NOT_FOUND: 404,
  NOTIFICATION_NOT_FOUND: 404,
  CONTENT_NOT_FOUND: 404,
  UPLOAD_REJECTED: 422,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}

export const err = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(code, message, details);

export const notFound = (code: ErrorCode, what: string) => new AppError(code, `${what} not found`);
