"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import type { StoreProduct } from "@/services/product-api";
import ProductCard from "./ProductCard";
import ProductDetailsModal from "./ProductDetailsModal";
import styles from "./carousel.module.css";

type NewArrivalsCarouselProps = {
  products: StoreProduct[];
  status: "loading" | "loaded" | "error";
  exchangeRate: number | null;
  wishlist: StoreProduct["id"][];
  onAddToCart: (product: StoreProduct) => void;
  onBuyNow: (product: StoreProduct) => void;
  onToggleWishlist: (productId: StoreProduct["id"]) => void;
};

const ROTATION_MS = 1000;
const ROTATION_INTERVAL_MS = 4500;
const RESUME_DELAY_MS = 4200;

function distributeProducts(products: StoreProduct[], limit = 8) {
  const groups = new Map<string, StoreProduct[]>();
  for (const product of products) {
    const group = groups.get(product.category) ?? [];
    group.push(product);
    groups.set(product.category, group);
  }

  const categories = Array.from(groups.values());
  const selected: StoreProduct[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const group of categories) {
      if (group[round]) {
        selected.push(group[round]);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

export default function NewArrivalsCarousel({
  products,
  status,
  exchangeRate,
  wishlist,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: NewArrivalsCarouselProps) {
  const showcaseProducts = useMemo(() => distributeProducts(products), [products]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [modalProduct, setModalProduct] = useState<StoreProduct | null>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const openModalTimerRef = useRef<number | null>(null);
  const swipeStartRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const productsCount = showcaseProducts.length;
  const step = productsCount > 0 ? 360 / productsCount : 0;

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const pauseForInteraction = useCallback(() => {
    clearResumeTimer();
    setAutoPaused(true);
    resumeTimerRef.current = window.setTimeout(() => {
      setAutoPaused(false);
      resumeTimerRef.current = null;
    }, RESUME_DELAY_MS);
  }, [clearResumeTimer]);

  const moveTo = useCallback((index: number) => {
    if (productsCount === 0) return;
    setActiveIndex((index + productsCount) % productsCount);
  }, [productsCount]);

  const selectProduct = useCallback((index: number) => {
    pauseForInteraction();
    if (openModalTimerRef.current !== null) window.clearTimeout(openModalTimerRef.current);
    moveTo(index);
    const delay = index === activeIndex ? 300 : ROTATION_MS + 100;
    openModalTimerRef.current = window.setTimeout(() => {
      const product = showcaseProducts[index];
      if (!product) return;
      clearResumeTimer();
      setAutoPaused(true);
      setModalProduct(product);
      openModalTimerRef.current = null;
    }, delay);
  }, [activeIndex, clearResumeTimer, moveTo, pauseForInteraction, showcaseProducts]);

  const closeModal = useCallback(() => {
    setModalProduct(null);
    clearResumeTimer();
    setAutoPaused(true);
    resumeTimerRef.current = window.setTimeout(() => {
      setAutoPaused(false);
      resumeTimerRef.current = null;
    }, RESUME_DELAY_MS);
  }, [clearResumeTimer]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, { threshold: 0.12 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || autoPaused || modalProduct || productsCount < 2) return;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % productsCount);
    }, ROTATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoPaused, isInView, modalProduct, productsCount]);

  useEffect(() => () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    if (openModalTimerRef.current !== null) window.clearTimeout(openModalTimerRef.current);
  }, []);

  const shiftProduct = (direction: -1 | 1) => {
    pauseForInteraction();
    moveTo(activeIndex + direction);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    swipeStartRef.current = event.clientX;
    swipedRef.current = false;
    pauseForInteraction();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (swipeStartRef.current === null) return;
    const distance = event.clientX - swipeStartRef.current;
    swipeStartRef.current = null;
    if (Math.abs(distance) < 48) return;
    swipedRef.current = true;
    shiftProduct(distance > 0 ? -1 : 1);
  };

  const handleAddToCart = (product: StoreProduct) => {
    setModalProduct(null);
    onAddToCart(product);
  };

  const handleBuyNow = (product: StoreProduct) => {
    setModalProduct(null);
    onBuyNow(product);
  };

  return (
    <section
      ref={sectionRef}
      id="new-arrivals"
      aria-labelledby="new-arrivals-heading"
      className={styles.section}
    >
      <div className={styles.sectionInner}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}><span className={styles.eyebrowDot} /> THE LATEST FROM GLOARO</p>
            <div className={styles.headingLine}>
              <h2 id="new-arrivals-heading">New Arrivals</h2>
              <span className={styles.justInBadge}>JUST IN</span>
            </div>
            <p className={styles.subtitle}>Discover the latest electronics, appliances &amp; smart technology.</p>
          </div>
          <p className={styles.headerNote}>A rotating edit of what’s new<br />and worth a closer look.</p>
        </div>

        <div
          className={styles.carouselStage}
          aria-roledescription="carousel"
          aria-label="New arrival products"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { swipeStartRef.current = null; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") shiftProduct(-1);
            if (event.key === "ArrowRight") shiftProduct(1);
          }}
        >
          <div
            className={styles.carouselRing}
            style={{ transform: `rotateY(${-activeIndex * step}deg)` }}
          >
            {showcaseProducts.map((product, index) => {
              const offset = Math.abs(index - activeIndex);
              const distance = Math.min(offset, productsCount - offset);
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  active={index === activeIndex}
                  angle={index * step}
                  distance={distance}
                  exchangeRate={exchangeRate}
                  onSelect={() => {
                    if (swipedRef.current) {
                      swipedRef.current = false;
                      return;
                    }
                    selectProduct(index);
                  }}
                />
              );
            })}
          </div>

          {status === "loading" && (
            <div className={styles.statusMessage} role="status">
              <LoaderCircle size={18} className={styles.loadingIcon} />
              Finding the latest arrivals…
            </div>
          )}
          {status === "error" && (
            <div className={styles.statusMessage} role="status">
              New arrivals are temporarily unavailable.
            </div>
          )}
          {status === "loaded" && productsCount === 0 && (
            <div className={styles.statusMessage} role="status">
              No new arrivals are available right now.
            </div>
          )}
        </div>

        {productsCount > 0 && (
          <div className={styles.carouselControls}>
            <button
              type="button"
              aria-label="Previous new arrival"
              onClick={() => shiftProduct(-1)}
              className={styles.arrowButton}
            >
              <ArrowLeft size={17} /><span>Previous</span>
            </button>
            <div className={styles.indicators} role="group" aria-label="Choose a product">
              {showcaseProducts.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  aria-label={`Show product ${index + 1}: ${product.name}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  onClick={() => {
                    pauseForInteraction();
                    moveTo(index);
                  }}
                  className={`${styles.indicator} ${index === activeIndex ? styles.indicatorActive : ""}`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next new arrival"
              onClick={() => shiftProduct(1)}
              className={styles.arrowButton}
            >
              <span>Next</span><ArrowRight size={17} />
            </button>
          </div>
        )}
      </div>

      <ProductDetailsModal
        product={modalProduct}
        exchangeRate={exchangeRate}
        isWishlisted={modalProduct ? wishlist.includes(modalProduct.id) : false}
        onClose={closeModal}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onToggleWishlist={onToggleWishlist}
      />
    </section>
  );
}
