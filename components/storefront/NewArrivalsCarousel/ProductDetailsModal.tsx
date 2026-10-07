"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, Heart, Plus, Star, X } from "lucide-react";
import type { StoreProduct } from "@/services/product-api";
import styles from "./carousel.module.css";

type ProductDetailsModalProps = {
  product: StoreProduct | null;
  exchangeRate: number | null;
  isWishlisted: boolean;
  onClose: () => void;
  onAddToCart: (product: StoreProduct) => void;
  onBuyNow: (product: StoreProduct) => void;
  onToggleWishlist: (productId: StoreProduct["id"]) => void;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function ProductDetailsModal({
  product,
  exchangeRate,
  isWishlisted,
  onClose,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: ProductDetailsModalProps) {
  const [activeImage, setActiveImage] = useState(() => product?.images[0] ?? "");
  const [zoomed, setZoomed] = useState(false);

  const currentImage = activeImage && product?.images.includes(activeImage)
    ? activeImage
    : product?.images[0] ?? product?.image ?? "";

  useEffect(() => {
    if (!product) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, product]);

  const discount = Math.round(product?.discount ?? 0);
  const canPurchase = Boolean(product?.available && exchangeRate !== null);

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.button
            type="button"
            aria-label="Close product details"
            className={styles.modalBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={onClose}
          />
          <motion.section
            key={product.id}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-arrival-product-title"
            className={styles.modalPanel}
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" aria-label="Close product details" onClick={onClose} className={styles.modalClose}>
              <X size={19} />
            </button>

            <div className={styles.modalGallery}>
              <div className={styles.modalMainImage}>
                <motion.img
                  key={currentImage}
                  src={currentImage}
                  alt={product.name}
                  initial={{ opacity: 0.55, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35 }}
                  onClick={() => setZoomed((current) => !current)}
                  className={`${styles.modalImage} ${zoomed ? styles.modalImageZoomed : ""}`}
                />
                <span className={styles.zoomHint}>{zoomed ? "Click to zoom out" : "Click image to zoom"}</span>
              </div>
              {product.images.length > 1 && (
                <div className={styles.thumbnailList} aria-label="Product images">
                  {product.images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      aria-label={`Show product image ${index + 1}`}
                      aria-pressed={activeImage === image}
                      className={`${styles.thumbnail} ${activeImage === image ? styles.thumbnailActive : ""}`}
                      onClick={() => {
                        setActiveImage(image);
                        setZoomed(false);
                      }}
                    >
                      <img src={image} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalProductInfo}>
              <div className={styles.modalEyebrow}>
                <span>{product.categoryName}</span>
                <span className={product.available ? styles.inStock : styles.outOfStock}>
                  {product.available ? `${product.stock} in stock` : "Out of stock"}
                </span>
              </div>
              <p className={styles.modalBrand}>{product.brand ?? "Brand not listed"}</p>
              <h2 id="new-arrival-product-title" className={styles.modalTitle}>{product.name}</h2>
              <div className={styles.modalRating}>
                <Star size={15} fill="currentColor" />
                <span>{product.rating ?? "No rating"}</span>
                <span>{product.reviewCount > 0 ? `· ${product.reviewCount} reviews` : "· No reviews yet"}</span>
              </div>

              <div className={styles.modalPrice}>
                {exchangeRate === null ? (
                  <span className={styles.modalCurrentPrice}>Price unavailable</span>
                ) : (
                  <span className={styles.modalCurrentPrice}>{money(product.price * exchangeRate)}</span>
                )}
                {exchangeRate !== null && product.old > product.price && (
                  <span className={styles.modalMrp}>MRP {money(product.old * exchangeRate)}</span>
                )}
                {discount > 0 && <span className={styles.modalDiscount}>{discount}% OFF</span>}
              </div>

              <p className={styles.modalDescription}>{product.description}</p>

              {Object.entries(product.specifications).length > 0 && (
                <div className={styles.specificationBlock}>
                  <h3>Product details</h3>
                  <dl>
                    {Object.entries(product.specifications).map(([label, value]) => (
                      <div key={label} className={styles.specificationRow}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  disabled={!canPurchase}
                  onClick={() => onAddToCart(product)}
                  className={styles.addToCartButton}
                >
                  <Plus size={17} /> Add to Cart
                </button>
                <button
                  type="button"
                  disabled={!canPurchase}
                  onClick={() => onBuyNow(product)}
                  className={styles.buyNowButton}
                >
                  Buy Now <ArrowUpRight size={17} />
                </button>
                <button
                  type="button"
                  aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  aria-pressed={isWishlisted}
                  onClick={() => onToggleWishlist(product.id)}
                  className={styles.wishlistButton}
                >
                  {isWishlisted ? <Check size={18} /> : <Heart size={18} />}
                  <span>{isWishlisted ? "Saved" : "Wishlist"}</span>
                </button>
              </div>
              {exchangeRate === null && <p className={styles.priceNotice}>Pricing is temporarily unavailable.</p>}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
