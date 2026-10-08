"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  BatteryCharging,
  Cable,
  Cpu,
  Monitor,
  PackageCheck,
  Ruler,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { StoreProduct } from "@/services/product-api";
import styles from "./ProductDNASection.module.css";

type ProductDNASectionProps = {
  products: StoreProduct[];
  status: "loading" | "loaded" | "error";
};

type DNAAttribute = {
  id: string;
  label: string;
  teaser: string;
  description: string;
  icon: LucideIcon;
  specificationPattern: RegExp;
  spotlight: string;
};

const attributes: DNAAttribute[] = [
  {
    id: "performance",
    label: "Performance",
    teaser: "Power, pace and everyday capability.",
    description: "The details that shape how this product performs in everyday use.",
    icon: Cpu,
    specificationPattern: /processor|cpu|chip|memory|ram|storage|graphics|performance/i,
    spotlight: "33% 34%",
  },
  {
    id: "design",
    label: "Design",
    teaser: "Form, feel and thoughtful details.",
    description: "A closer look at the materials, dimensions and details behind the design.",
    icon: Ruler,
    specificationPattern: /dimension|weight|material|finish|colour|color/i,
    spotlight: "65% 34%",
  },
  {
    id: "display",
    label: "Display",
    teaser: "Screen details that shape the view.",
    description: "The screen specifications included in this product's listing.",
    icon: Monitor,
    specificationPattern: /display|screen|resolution|panel|refresh/i,
    spotlight: "67% 47%",
  },
  {
    id: "battery",
    label: "Battery",
    teaser: "Power built around your day.",
    description: "Battery and charging information provided for this product.",
    icon: BatteryCharging,
    specificationPattern: /battery|capacity|charging|charge|endurance/i,
    spotlight: "49% 67%",
  },
  {
    id: "connectivity",
    label: "Connectivity",
    teaser: "Ports, wireless and connections.",
    description: "The wired and wireless connections listed for this product.",
    icon: Cable,
    specificationPattern: /connectivity|wi-?fi|bluetooth|usb|port|network/i,
    spotlight: "34% 62%",
  },
  {
    id: "smart",
    label: "Smart features",
    teaser: "Useful details behind smarter tech.",
    description: "Software, warranty and other useful details from the listing.",
    icon: Sparkles,
    specificationPattern: /smart|software|operating system|os|warranty|return/i,
    spotlight: "50% 30%",
  },
];

const connectionPaths = [
  "M 285 220 C 235 162, 175 115, 82 72",
  "M 355 218 C 405 154, 455 108, 552 72",
  "M 390 264 C 460 250, 497 248, 568 238",
  "M 365 321 C 420 374, 474 421, 550 455",
  "M 280 330 C 225 383, 170 428, 100 455",
  "M 240 270 C 177 270, 130 265, 75 257",
];

const attributeTilts = [
  [1, -3],
  [1.5, 3],
  [0, 4],
  [-2, 2],
  [1.5, -2],
  [-1, -4],
] as const;

function formatAvailableFacts(product: StoreProduct, attribute: DNAAttribute) {
  return Object.entries(product.specifications).filter(([label]) =>
    attribute.specificationPattern.test(label),
  );
}

function AttributeButton({
  attribute,
  index,
  active,
  locked,
  onPreview,
  onSelect,
  onClearPreview,
  className,
}: {
  attribute: DNAAttribute;
  index: number;
  active: boolean;
  locked: boolean;
  onPreview: () => void;
  onSelect: () => void;
  onClearPreview: () => void;
  className: string;
}) {
  const Icon = attribute.icon;

  return (
    <button
      type="button"
      className={`${className} ${active ? styles.nodeActive : ""}`}
      aria-pressed={locked}
      aria-controls="product-dna-specs"
      onMouseEnter={onPreview}
      onMouseLeave={onClearPreview}
      onFocus={onPreview}
      onBlur={onClearPreview}
      onClick={onSelect}
    >
      <span className={styles.nodeIcon}><Icon size={17} strokeWidth={1.7} /></span>
      <span className={styles.nodeCopy}>
        <span className={styles.nodeIndex}>{String(index + 1).padStart(2, "0")}</span>
        <span className={styles.nodeName}>{attribute.label}</span>
        <span className={styles.nodeTeaser}>{attribute.teaser}</span>
      </span>
    </button>
  );
}

export default function ProductDNASection({ products, status }: ProductDNASectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { margin: "-10% 0px" });
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 85, damping: 22, mass: 0.8 });
  const smoothY = useSpring(pointerY, { stiffness: 85, damping: 22, mass: 0.8 });
  const rotateX = useTransform(smoothY, [-1, 1], [4, -4]);
  const rotateY = useTransform(smoothX, [-1, 1], [-5, 5]);
  const product = useMemo(
    () => products.find((item) => item.category === "laptops") ?? products[0] ?? null,
    [products],
  );
  const [lockedAttribute, setLockedAttribute] = useState(0);
  const [previewAttribute, setPreviewAttribute] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const activeIndex = previewAttribute ?? lockedAttribute;
  const activeAttribute = attributes[activeIndex];
  const [selectedTiltX, selectedTiltY] = attributeTilts[activeIndex];
  const availableFacts = product ? formatAvailableFacts(product, activeAttribute) : [];
  const rating = product?.rating ? Number(product.rating) : null;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1);
    pointerY.set(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  };

  const resetParallax = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const selectAttribute = (index: number) => {
    setLockedAttribute(index);
    setPreviewAttribute(null);
  };

  return (
    <section
      ref={sectionRef}
      id="discover"
      className={styles.section}
      aria-labelledby="product-dna-heading"
    >
      <div className={styles.sectionInner}>
        <div className={`${styles.layout} ${isInView ? styles.inView : ""}`}>
          <motion.header
            className={styles.intro}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={isInView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className={styles.eyebrow}><span className={styles.eyebrowMark}>✳</span> PRODUCT DNA</p>
            <p className={styles.introKicker}>THE DETAILS THAT MAKE IT EXTRAORDINARY</p>
            <h2 id="product-dna-heading">Engineered beyond <em>the surface.</em></h2>
            <p className={styles.introDescription}>
              Go beyond the first impression. Explore the details, verified product information
              and everyday thinking behind a considered tech pick.
            </p>
            <a className={styles.exploreLink} href="#product-dna-specs">
              Explore the DNA <ArrowRight size={15} />
            </a>
            <span className={styles.introFootnote}>PRODUCT <span>→</span> DNA <span>→</span> EVERYDAY BENEFIT</span>
          </motion.header>

          <div className={styles.showcase}>
            <div
              className={styles.orbitStage}
              role="group"
              onPointerMove={handlePointerMove}
              onPointerLeave={resetParallax}
              style={{ "--spotlight-position": activeAttribute.spotlight } as React.CSSProperties}
              aria-label={product ? `Product DNA explorer for ${product.name}` : "Product DNA explorer"}
            >
              <div className={styles.atmosphere} aria-hidden="true" />
              <div className={`${styles.orbit} ${styles.orbitOuter}`} aria-hidden="true" />
              <div className={`${styles.orbit} ${styles.orbitInner}`} aria-hidden="true" />
              <svg className={styles.connections} viewBox="0 0 640 520" fill="none" aria-hidden="true">
                {connectionPaths.map((path, index) => (
                  <path
                    key={path}
                    d={path}
                    className={index === activeIndex ? styles.connectionActive : ""}
                  />
                ))}
              </svg>

              {product && !imageFailed ? (
                <motion.div
                  className={styles.selectionTilt}
                  animate={prefersReducedMotion ? { rotateX: 0, rotateY: 0 } : { rotateX: selectedTiltX, rotateY: selectedTiltY }}
                  transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
                >
                  <motion.div
                    className={styles.productParallax}
                    style={prefersReducedMotion ? undefined : { rotateX, rotateY }}
                  >
                    <div className={styles.productObject}>
                      <Image
                        key={product.id}
                        src={product.images[0] ?? product.image}
                        alt={`${product.name} by ${product.brand ?? "HI-FI electronics"}`}
                        fill
                        sizes="(max-width: 700px) 76vw, (max-width: 1199px) 45vw, 38vw"
                        loading="lazy"
                        decoding="async"
                        onError={() => setImageFailed(true)}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <div className={styles.productPlaceholder} role={status === "error" ? "alert" : "status"}>
                  <PackageCheck size={30} strokeWidth={1.3} />
                  <span>{product ? "Product image is unavailable" : status === "error" ? "Product details could not be loaded" : "Finding a product to explore…"}</span>
                </div>
              )}

              {product && (
                <div className={styles.productCaption}>
                  <span className={styles.productBrand}>{product.brand ?? product.categoryName}</span>
                  <span className={styles.productName}>{product.name}</span>
                </div>
              )}

              {product && (
                <div className={`${styles.orbitNodes} ${previewAttribute !== null ? styles.hasPreview : ""}`}>
                  {attributes.map((attribute, index) => (
                    <AttributeButton
                      key={attribute.id}
                      attribute={attribute}
                      index={index}
                      active={activeIndex === index}
                      locked={lockedAttribute === index}
                      onPreview={() => setPreviewAttribute(index)}
                      onClearPreview={() => setPreviewAttribute(null)}
                      onSelect={() => selectAttribute(index)}
                      className={`${styles.orbitNode} ${styles[`orbitNode${index + 1}`]}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {product && (
              <div className={styles.mobileNodeRail} aria-label="Choose a product attribute">
                {attributes.map((attribute, index) => (
                  <AttributeButton
                    key={attribute.id}
                    attribute={attribute}
                    index={index}
                    active={activeIndex === index}
                    locked={lockedAttribute === index}
                    onPreview={() => setPreviewAttribute(index)}
                    onClearPreview={() => setPreviewAttribute(null)}
                    onSelect={() => selectAttribute(index)}
                    className={styles.railNode}
                  />
                ))}
              </div>
            )}
          </div>

          <motion.aside
            id="product-dna-specs"
            className={styles.specPanel}
            aria-live="polite"
            aria-label={`${activeAttribute.label} product details`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={isInView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.panelTopline}>
              <span>INSIDE THE PRODUCT</span>
              <span className={styles.panelIndex}>{String(activeIndex + 1).padStart(2, "0")} / 06</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${product?.id ?? "empty"}-${activeAttribute.id}`}
                className={styles.panelContent}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.28 }}
              >
                <span className={styles.panelNodeIcon}><activeAttribute.icon size={18} strokeWidth={1.7} /></span>
                <h3>{activeAttribute.label}</h3>
                <p className={styles.panelDescription}>{activeAttribute.description}</p>
                <div className={styles.panelDivider} />
                <p className={styles.specHeading}>SUPPLIER-LISTED DETAILS</p>
                {product ? (
                  availableFacts.length > 0 ? (
                    <dl className={styles.specList}>
                      {availableFacts.map(([label, value]) => (
                        <div className={styles.specRow} key={label}>
                          <dt>{label}</dt><dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className={styles.missingDetails}>
                      This product listing doesn&apos;t include {activeAttribute.label.toLowerCase()} specifications.
                    </p>
                  )
                ) : (
                  <p className={styles.missingDetails}>
                    {status === "error" ? "Live product details are temporarily unavailable." : "Product details will appear here once loaded."}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {product && (
              <div className={styles.ratingBlock}>
                <div className={styles.ratingLine}>
                  <span>Customer rating</span>
                  <strong>{rating === null ? "Not rated" : `${rating.toFixed(1)} / 5`}</strong>
                </div>
                <div className={styles.ratingTrack} aria-label={rating === null ? "No customer rating available" : `Customer rating ${rating.toFixed(1)} out of 5`}>
                  <span style={{ width: rating === null ? "0%" : `${Math.min(Math.max(rating, 0), 5) * 20}%` }} />
                </div>
                <div className={styles.panelFooter}>
                  <span>{product.reviewCount > 0 ? `${product.reviewCount} verified reviews` : "No reviews yet"}</span>
                  <span className={product.available ? styles.inStock : styles.outOfStock}>
                    {product.available ? "IN STOCK" : "SOLD OUT"}
                  </span>
                </div>
              </div>
            )}
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
