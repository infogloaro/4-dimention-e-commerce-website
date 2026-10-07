"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight, Star } from "lucide-react";
import type { StoreProduct } from "@/services/product-api";
import styles from "./carousel.module.css";

type ProductCardProps = {
  product: StoreProduct;
  active: boolean;
  angle: number;
  distance: number;
  exchangeRate: number | null;
  onSelect: () => void;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function ProductCard({
  product,
  active,
  angle,
  distance,
  exchangeRate,
  onSelect,
}: ProductCardProps) {
  const cardStyle = {
    "--card-angle": `${angle}deg`,
    "--card-scale": String(Math.max(0.68, 1 - distance * 0.11)),
    "--card-blur": `${Math.min(4.5, distance * 1.5)}px`,
    "--card-opacity": String(Math.max(0.28, 1 - distance * 0.18)),
    zIndex: Math.max(1, 20 - Math.round(distance)),
  } as CSSProperties;

  return (
    <button
      type="button"
      aria-label={`View ${product.name}${product.brand ? ` by ${product.brand}` : ""}`}
      aria-pressed={active}
      onClick={onSelect}
      className={`${styles.productCard} ${active ? styles.productCardActive : ""}`}
      style={cardStyle}
    >
      <div className={styles.cardSurface}>
        <div className={styles.productVisual}>
          <div className={styles.cardBadges}>
            <span className={styles.categoryBadge}>{product.categoryName}</span>
            {active && <span className={styles.newBadge}>JUST IN</span>}
          </div>
          <img
            src={product.image}
            alt={product.name}
            loading={active ? "eager" : "lazy"}
            decoding="async"
            className={styles.productImage}
          />
          {active && product.discount > 0 && (
            <span className={styles.discountBadge}>{Math.round(product.discount)}% OFF</span>
          )}
        </div>

        <div className={styles.cardDetails}>
          <p className={styles.brandName}>{product.brand ?? "Brand not listed"}</p>
          <h3 className={styles.productName}>{product.name}</h3>
          {active ? (
            <>
              <div className={styles.productRating}>
                <Star size={13} fill="currentColor" />
                <span>{product.rating ?? "—"}</span>
                <span className={styles.reviewCount}>
                  {product.reviewCount > 0 ? `(${product.reviewCount} reviews)` : "(No reviews yet)"}
                </span>
              </div>
              <div className={styles.priceLine}>
                {exchangeRate === null ? (
                  <span className={styles.currentPrice}>Price unavailable</span>
                ) : (
                  <span className={styles.currentPrice}>{money(product.price * exchangeRate)}</span>
                )}
                {exchangeRate !== null && product.old > product.price && (
                  <span className={styles.oldPrice}>{money(product.old * exchangeRate)}</span>
                )}
              </div>
              <div className={styles.cardFooter}>
                <span className={product.available ? styles.inStock : styles.outOfStock}>
                  {product.available ? "In stock" : "Out of stock"}
                </span>
                <span className={styles.detailsHint}>Discover <ArrowUpRight size={14} /></span>
              </div>
            </>
          ) : (
            <div className={styles.sideCardFooter}>
              {exchangeRate !== null && (
                <span className={styles.sidePrice}>{money(product.price * exchangeRate)}</span>
              )}
              <span className={styles.sideRating}>
                <Star size={11} fill="currentColor" /> {product.rating ?? "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
