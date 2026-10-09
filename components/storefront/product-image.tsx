"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * The ONLY way the storefront renders a product picture.
 *
 *  - `src` is whatever the API says belongs to this product / variant / order line; it is never guessed or index-based.
 *  - If it is missing or fails to load, a NEUTRAL placeholder for the product's category is shown ("Image coming soon") —
 *    never another product's picture. The placeholder itself can fail only once: after that an inline icon is rendered, so
 *    there is no error loop.
 *  - `ProductImage` keeps a fixed aspect-ratio box and the <img> carries its intrinsic size and lazy/async loading, so
 *    nothing shifts while images load. `SafeImg` is the bare element for places with their own CSS (carousel, gallery).
 *
 * Catalogue art is SVG (and uploaded photos may live on any CDN), so a plain <img> is used instead of next/image: the
 * optimiser does nothing for SVG and would reject hosts that are not allow-listed in next.config.ts.
 */
const placeholderFor = (category?: string | null) => `/catalog/placeholders/${category && /^[a-z0-9-]+$/.test(category) ? category : "product"}.svg`;

interface SafeImgProps {
  src: string | null | undefined;
  alt: string;
  /** category slug, used to pick the neutral placeholder */
  category?: string | null;
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
  draggable?: boolean;
  onClick?: () => void;
}

export function SafeImg({ src, alt, category, className, priority = false, width = 600, height = 600, onClick }: SafeImgProps) {
  // remember WHICH src failed (not just "failed") so a new src on the same component instance gets a fresh attempt
  const [failed, setFailed] = useState<{ src: string | null | undefined; placeholder: boolean }>({ src: undefined, placeholder: false });
  const srcFailed = failed.src === src;
  const usePlaceholder = !src || srcFailed;
  const placeholderBroken = usePlaceholder && srcFailed && failed.placeholder; // the neutral placeholder failed too

  if (placeholderBroken) {
    return <span role="img" aria-label={alt} className={`flex items-center justify-center bg-[#eceae2] text-[#9a9b90] ${className ?? ""}`}><ImageOff size={28} aria-hidden /></span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see file comment
    <img
      key={usePlaceholder ? "placeholder" : src}
      src={usePlaceholder ? placeholderFor(category) : src!}
      alt={usePlaceholder ? `${alt} — image coming soon` : alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onClick={onClick}
      onError={() => setFailed({ src, placeholder: usePlaceholder })}
      className={className}
    />
  );
}

interface ProductImageProps extends SafeImgProps {
  /** classes for the aspect-ratio box */
  boxClassName?: string;
  /** CSS aspect-ratio of the box, e.g. "1 / 1" (default) or "4 / 3" */
  ratio?: string;
  fit?: "contain" | "cover";
}

export function ProductImage({ boxClassName = "", ratio = "1 / 1", fit = "contain", className = "", ...img }: ProductImageProps) {
  return (
    <div className={`relative overflow-hidden ${boxClassName}`} style={{ aspectRatio: ratio }}>
      <SafeImg {...img} className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`} />
    </div>
  );
}
