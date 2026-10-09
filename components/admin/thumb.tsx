"use client";

import { SafeImg } from "@/components/storefront/product-image";

/** Admin thumbnail with the same failure handling as the storefront: broken/missing URL → neutral placeholder, never a broken icon. */
export function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className: string }) {
  return <SafeImg src={src} alt={alt} width={64} height={64} className={className} />;
}
