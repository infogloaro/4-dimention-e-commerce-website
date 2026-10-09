"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiRequest, ApiError, errorMessage } from "@/lib/shop/api";
import type { Cart, Me } from "@/lib/shop/types";

/**
 * Storefront state that must be shared across pages: who is signed in, the SERVER cart and wishlist, the cart drawer and
 * toast notices. Nothing here computes a price — every cart mutation returns the new server-priced cart and we render it
 * as-is (docs/backend/FRONTEND_INTEGRATION.md §8).
 */
interface ShopContextValue {
  user: Me | null;
  authReady: boolean;
  cart: Cart | null;
  cartReady: boolean;
  cartBusy: boolean;
  cartCount: number;
  wishlist: ReadonlySet<string>;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  notice: string;
  notify: (message: string) => void;
  refreshCart: () => Promise<void>;
  addToCart: (variantId: string, quantity: number, label?: string) => Promise<boolean>;
  setLineQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<string | null>;
  removeCoupon: (code: string) => Promise<void>;
  toggleWishlist: (productId: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartReady, setCartReady] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [wishlist, setWishlist] = useState<ReadonlySet<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const loadCart = useCallback(async () => {
    try {
      const res = await api.get<Cart>("/cart");
      setCart(res.data);
    } catch {
      /* keep the previous cart; pages show their own retry affordance */
    } finally {
      setCartReady(true);
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    try {
      const res = await api.get<{ productIds: string[] }>("/wishlist", { idsOnly: "true" });
      setWishlist(new Set(res.data.productIds));
    } catch {
      setWishlist(new Set());
    }
  }, []);

  // boot: session + cart in parallel
  useEffect(() => {
    let alive = true;
    (async () => {
      const [me] = await Promise.all([
        api.get<{ user: Me }>("/auth/me").then((r) => r.data.user).catch(() => null),
        loadCart(),
      ]);
      if (!alive) return;
      setUser(me);
      setAuthReady(true);
      if (me) void loadWishlist();
    })();
    return () => { alive = false; };
  }, [loadCart, loadWishlist]);

  const mutateCart = useCallback(async (run: () => Promise<{ data: Cart }>, failure = "We couldn't update your bag."): Promise<boolean> => {
    setCartBusy(true);
    try {
      const res = await run();
      setCart(res.data);
      return true;
    } catch (e) {
      notify(e instanceof ApiError && e.status !== 0 ? e.message : failure);
      await loadCart(); // the server is the truth: re-sync after any failed mutation
      return false;
    } finally {
      setCartBusy(false);
    }
  }, [loadCart, notify]);

  const addToCart = useCallback(async (variantId: string, quantity: number, label?: string) => {
    const ok = await mutateCart(() => api.post<Cart>("/cart/items", { variantId, quantity }), "We couldn't add that to your bag.");
    if (ok) { notify(label ? `${label} added to your bag` : "Added to your bag"); setCartOpen(true); }
    return ok;
  }, [mutateCart, notify]);

  const setLineQuantity = useCallback(async (lineId: string, quantity: number) => {
    await mutateCart(() => api.patch<Cart>(`/cart/items/${lineId}`, { quantity }));
  }, [mutateCart]);

  const removeLine = useCallback(async (lineId: string) => {
    await mutateCart(() => api.del<Cart>(`/cart/items/${lineId}`));
  }, [mutateCart]);

  const applyCoupon = useCallback(async (code: string): Promise<string | null> => {
    setCartBusy(true);
    try {
      const res = await api.post<Cart>("/cart/coupon", { code });
      setCart(res.data);
      const rejected = res.data.coupons.rejected.find((r) => r.code.toLowerCase() === code.trim().toLowerCase());
      return rejected ? rejected.message : null;
    } catch (e) {
      return errorMessage(e);
    } finally {
      setCartBusy(false);
    }
  }, []);

  const removeCoupon = useCallback(async (code: string) => {
    await mutateCart(() => apiRequest<Cart>("/cart/coupon", { method: "DELETE", body: { code } }));
  }, [mutateCart]);

  const afterAuth = useCallback(async (me: Me) => {
    setUser(me);
    setAuthReady(true);
    await Promise.all([loadCart(), loadWishlist()]); // the guest cart was merged server-side
  }, [loadCart, loadWishlist]);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.post("/auth/login", { email, password });
    const me = (await api.get<{ user: Me }>("/auth/me")).data.user;
    await afterAuth(me);
  }, [afterAuth]);

  const register = useCallback(async (input: { name: string; email: string; password: string; phone?: string }) => {
    await api.post("/auth/register", input);
    const me = (await api.get<{ user: Me }>("/auth/me")).data.user;
    await afterAuth(me);
  }, [afterAuth]);

  const signOut = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* cookie may already be gone */ }
    setUser(null);
    setWishlist(new Set());
    setCart(null);
    await loadCart();
  }, [loadCart]);

  const toggleWishlist = useCallback(async (productId: string, name?: string) => {
    if (!user) { notify("Sign in to save items to your wishlist"); router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    const saved = wishlist.has(productId);
    setWishlist((cur) => { const next = new Set(cur); if (saved) next.delete(productId); else next.add(productId); return next; }); // optimistic
    try {
      if (saved) await api.del(`/wishlist/${productId}`); else await api.post("/wishlist", { productId });
      notify(saved ? "Removed from your wishlist" : `${name ?? "Item"} saved to your wishlist`);
    } catch (e) {
      setWishlist((cur) => { const next = new Set(cur); if (saved) next.add(productId); else next.delete(productId); return next; });
      notify(errorMessage(e));
    }
  }, [notify, router, user, wishlist]);

  const value = useMemo<ShopContextValue>(() => ({
    user, authReady, cart, cartReady, cartBusy,
    cartCount: cart?.itemCount ?? 0,
    wishlist, cartOpen,
    openCart: () => setCartOpen(true), closeCart: () => setCartOpen(false),
    notice, notify, refreshCart: loadCart, addToCart, setLineQuantity, removeLine, applyCoupon, removeCoupon, toggleWishlist, signIn, register, signOut,
  }), [user, authReady, cart, cartReady, cartBusy, wishlist, cartOpen, notice, notify, loadCart, addToCart, setLineQuantity, removeLine, applyCoupon, removeCoupon, toggleWishlist, signIn, register, signOut]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
