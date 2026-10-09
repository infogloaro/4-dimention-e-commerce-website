"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, Heart, Plus, Star, X } from "lucide-react";
import { SafeImg } from "../product-image";
import { money } from "@/lib/shop/format";
import type { ProductCard } from "@/lib/shop/types";
import styles from "./carousel.module.css";

type ProductDetailsModalProps = {
  product: ProductCard | null;
  isWishlisted: boolean;
  onClose: () => void;
  onAddToCart: (product: ProductCard) => void;
  onBuyNow: (product: ProductCard) => void;
  onToggleWishlist: (productId: string) => void;
};

/** Quick view. Everything shown is the product's own API record; the full page (variants, specs, reviews) is one click away. */
export default function ProductDetailsModal({ product, isWishlisted, onClose, onAddToCart, onBuyNow, onToggleWishlist }: ProductDetailsModalProps) {
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!product) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose, product]);

  const images = product ? [product.image && { url: product.image.url, alt: product.image.alt }, product.hoverImage].filter((i): i is { url: string; alt: string } => !!i) : [];
  const image = images[Math.min(activeImage, Math.max(0, images.length - 1))];
  const simple = !!product && !product.hasVariants && !!product.defaultVariantId && product.inStock;
  const discount = product?.price.discountPercent ?? 0;

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.button type="button" aria-label="Close product details" className={styles.modalBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} onClick={onClose} />
          <motion.section key={product.id} role="dialog" aria-modal="true" aria-labelledby="new-arrival-product-title" className={styles.modalPanel} initial={{ opacity: 0, scale: 0.92, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }} onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Close product details" onClick={onClose} className={styles.modalClose}><X size={19} /></button>

            <div className={styles.modalGallery}>
              <div className={styles.modalMainImage}>
                <SafeImg key={image?.url} src={image?.url} alt={image?.alt ?? product.name} category={product.category.slug} priority className={styles.modalImage} width={800} height={800} />
              </div>
              {images.length > 1 && (
                <div className={styles.thumbnailList} aria-label="Product images">
                  {images.map((img, index) => (
                    <button key={img.url} type="button" aria-label={`Show product image ${index + 1}`} aria-pressed={index === activeImage} className={`${styles.thumbnail} ${index === activeImage ? styles.thumbnailActive : ""}`} onClick={() => setActiveImage(index)}>
                      <SafeImg src={img.url} alt="" category={product.category.slug} width={54} height={54} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalProductInfo}>
              <div className={styles.modalEyebrow}>
                <span>{product.category.name}</span>
                <span className={product.inStock ? styles.inStock : styles.outOfStock}>{product.inStock ? (product.stockStatus === "LOW_STOCK" ? "Only a few left" : "In stock") : "Out of stock"}</span>
              </div>
              <p className={styles.modalBrand}>{product.brand?.name ?? "Brand not listed"}</p>
              <h2 id="new-arrival-product-title" className={styles.modalTitle}>{product.name}</h2>
              <div className={styles.modalRating}>
                <Star size={15} fill="currentColor" />
                <span>{product.rating.count > 0 ? product.rating.average.toFixed(1) : "No rating"}</span>
                <span>{product.rating.count > 0 ? `· ${product.rating.count} reviews` : "· No reviews yet"}</span>
              </div>
              <div className={styles.modalPrice}>
                <span className={styles.modalCurrentPrice}>{product.price.from ? "From " : ""}{money(product.price.price)}</span>
                {product.price.compareAtPrice && product.price.onSale && <span className={styles.modalMrp}>MRP {money(product.price.compareAtPrice)}</span>}
                {discount > 0 && <span className={styles.modalDiscount}>{discount}% OFF</span>}
              </div>
              {product.shortDescription && <p className={styles.modalDescription}>{product.shortDescription}</p>}
              {product.hasVariants && <p className={styles.priceNotice}>Available in several options — pick yours on the product page.</p>}

              <div className={styles.modalActions}>
                {simple ? (
                  <>
                    <button type="button" onClick={() => onAddToCart(product)} className={styles.addToCartButton}><Plus size={17} /> Add to Cart</button>
                    <button type="button" onClick={() => onBuyNow(product)} className={styles.buyNowButton}>Buy Now <ArrowUpRight size={17} /></button>
                  </>
                ) : (
                  <Link href={`/products/${product.slug}`} onClick={onClose} className={styles.buyNowButton}>{product.inStock ? "Choose options" : "View details"} <ArrowUpRight size={17} /></Link>
                )}
                <button type="button" aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={isWishlisted} onClick={() => onToggleWishlist(product.id)} className={styles.wishlistButton}>
                  {isWishlisted ? <Check size={18} /> : <Heart size={18} />}<span>{isWishlisted ? "Saved" : "Wishlist"}</span>
                </button>
              </div>
              {simple && <Link href={`/products/${product.slug}`} onClick={onClose} className="mt-3 text-sm underline underline-offset-4">Full details &amp; specifications</Link>}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
