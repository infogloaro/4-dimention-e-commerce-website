"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight, Star } from "lucide-react";
import { SafeImg } from "../product-image";
import { money } from "@/lib/shop/format";
import type { ProductCard as Product } from "@/lib/shop/types";
import styles from "./carousel.module.css";

type ProductCardProps = {
  product: Product;
  active: boolean;
  angle: number;
  distance: number;
  onSelect: () => void;
};

export default function ProductCard({
  product,
  active,
  angle,
  distance,
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
      aria-label={`View ${product.name}${product.brand ? ` by ${product.brand.name}` : ""}`}
      aria-pressed={active}
      onClick={onSelect}
      className={`${styles.productCard} ${active ? styles.productCardActive : ""}`}
      style={cardStyle}
    >
      <div className={styles.cardSurface}>
        <div className={styles.productVisual}>
          <div className={styles.cardBadges}>
            <span className={styles.categoryBadge}>{product.category.name}</span>
            {active && <span className={styles.newBadge}>JUST IN</span>}
          </div>
          <SafeImg src={product.image?.url} alt={product.image?.alt ?? product.name} category={product.category.slug} priority={active} className={styles.productImage} />
          {active && product.price.discountPercent > 0 && (
            <span className={styles.discountBadge}>{product.price.discountPercent}% OFF</span>
          )}
        </div>

        <div className={styles.cardDetails}>
          <p className={styles.brandName}>{product.brand?.name ?? "Brand not listed"}</p>
          <h3 className={styles.productName}>{product.name}</h3>
          {active ? (
            <>
              <div className={styles.productRating}>
                <Star size={13} fill="currentColor" />
                <span>{product.rating.count > 0 ? product.rating.average.toFixed(1) : "—"}</span>
                <span className={styles.reviewCount}>
                  {product.rating.count > 0 ? `(${product.rating.count} reviews)` : "(No reviews yet)"}
                </span>
              </div>
              <div className={styles.priceLine}>
                <span className={styles.currentPrice}>{product.price.from ? "From " : ""}{money(product.price.price)}</span>
                {product.price.compareAtPrice && product.price.onSale && (
                  <span className={styles.oldPrice}>{money(product.price.compareAtPrice)}</span>
                )}
              </div>
              <div className={styles.cardFooter}>
                <span className={product.inStock ? styles.inStock : styles.outOfStock}>
                  {product.inStock ? "In stock" : "Out of stock"}
                </span>
                <span className={styles.detailsHint}>Discover <ArrowUpRight size={14} /></span>
              </div>
            </>
          ) : (
            <div className={styles.sideCardFooter}>
              <span className={styles.sidePrice}>{money(product.price.price)}</span>
              <span className={styles.sideRating}>
                <Star size={11} fill="currentColor" /> {product.rating.count > 0 ? product.rating.average.toFixed(1) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
