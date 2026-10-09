"use client";

import { Thumb } from "./thumb";
import { ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/admin/api";
import { minorToRupees, rupeesToMinor } from "@/lib/admin/format";
import { useAdminMutation, useDataQuery } from "./data";
import { Badge, Btn, Card, Field, Input, Select, Textarea, Toggle, useToast } from "./ui";

/* ───────── electronics specification templates (UI presets; the server validates the submitted attributes) ───────── */
interface SpecRow { group: string; name: string; value: string; unit: string }
const T = (group: string, ...names: [string, string?][]): SpecRow[] => names.map(([name, unit]) => ({ group, name, unit: unit ?? "", value: "" }));
export const SPEC_TEMPLATES: Record<string, SpecRow[]> = {
  Smartphone: [
    ...T("Display", ["Display size", "in"], ["Panel type"], ["Resolution"], ["Refresh rate", "Hz"]),
    ...T("Performance", ["Processor"], ["RAM", "GB"], ["Internal storage", "GB"]),
    ...T("Camera", ["Rear camera"], ["Front camera"]),
    ...T("Battery", ["Battery capacity", "mAh"], ["Charging"]),
    ...T("Connectivity", ["Network"], ["Wi-Fi"], ["Bluetooth"], ["SIM"]),
    ...T("Software", ["Operating system"]),
    ...T("Physical", ["Dimensions", "mm"], ["Weight", "g"], ["Colour"]),
    ...T("Warranty", ["Warranty", "months"]),
  ],
  Laptop: [
    ...T("Performance", ["Processor"], ["Graphics (GPU)"], ["RAM", "GB"], ["Storage", "GB"]),
    ...T("Display", ["Display size", "in"], ["Panel type"], ["Resolution"], ["Refresh rate", "Hz"]),
    ...T("Battery & power", ["Battery capacity", "Wh"], ["Power adapter", "W"]),
    ...T("Connectivity", ["Ports"], ["Wi-Fi"], ["Bluetooth"]),
    ...T("Software", ["Operating system"]),
    ...T("Physical", ["Dimensions", "mm"], ["Weight", "kg"], ["Colour"]),
    ...T("Warranty", ["Warranty", "months"]),
  ],
  "Audio / wearable": [
    ...T("Audio", ["Driver size", "mm"], ["Noise cancellation"], ["Frequency response", "Hz"]),
    ...T("Battery", ["Battery life", "hours"], ["Charging"]),
    ...T("Connectivity", ["Bluetooth"], ["Ports"]),
    ...T("Physical", ["Weight", "g"], ["Colour"]),
    ...T("Warranty", ["Warranty", "months"]),
  ],
  "Charger / power": [
    ...T("Power", ["Output power", "W"], ["Input"], ["Standards"], ["Ports"]),
    ...T("Physical", ["Dimensions", "mm"], ["Weight", "g"], ["Colour"]),
    ...T("Warranty", ["Warranty", "months"]),
  ],
};

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

interface MediaRow { url: string; alt: string; isPrimary: boolean }
interface VariantRow { sku: string; name: string; price: string; compareAt: string; cost: string; weight: string; options: string; qty: string; threshold: string; backorder: boolean }
const emptyVariant = (): VariantRow => ({ sku: "", name: "", price: "", compareAt: "", cost: "", weight: "0", options: "", qty: "0", threshold: "5", backorder: false });

interface Detail {
  id: string; name: string; slug: string; status: string; shortDescription: string; description: string; highlights: string[];
  brand: { id: string } | null; category: { id: string }; tags: { name: string }[]; badges: { key: string; label: string }[];
  media: { url: string; alt: string | null; isPrimary: boolean }[]; maxQuantityPerOrder: number; taxRatePercent: number;
  specifications: { group: string; items: { name: string; value: string; unit: string | null }[] }[];
  variants: { id: string; sku: string; name: string | null; isDefault: boolean; price: { price: number; compareAtPrice: number | null }; weightGrams: number; availability: { available: number; status: string } }[];
  seo: { title?: string | null; description?: string | null; keywords?: string[]; canonicalUrl?: string | null; ogImage?: string | null };
}
interface Opt { id: string; name: string; depth?: number }

export function ProductForm({ product }: { product?: Detail }) {
  const router = useRouter();
  const toast = useToast();
  const edit = !!product;
  const brands = useDataQuery<Opt[]>(["brands-options"], "/admin/brands");
  const cats = useDataQuery<Opt[]>(["categories-options"], "/admin/categories");

  const [s, setS] = useState(() => ({
    name: product?.name ?? "", slug: product?.slug ?? "", shortDescription: product?.shortDescription ?? "", description: product?.description ?? "",
    status: product?.status ?? "DRAFT", brandId: product?.brand?.id ?? "", categoryId: product?.category.id ?? "",
    taxRatePercent: String(product?.taxRatePercent ?? 18), hsnCode: "", maxQty: String(product?.maxQuantityPerOrder ?? 10), productType: "physical",
    isFeatured: edit ? "keep" : "no", isBestseller: edit ? "keep" : "no", isNewArrival: edit ? "keep" : "no",
    highlights: (product?.highlights ?? []).join("\n"), tags: (product?.tags ?? []).map((t) => t.name).join(", "), badges: (product?.badges ?? []).map((b) => b.label).join(", "),
    seoTitle: product?.seo.title ?? "", seoDescription: product?.seo.description ?? "", seoKeywords: (product?.seo.keywords ?? []).join(", "), canonicalUrl: product?.seo.canonicalUrl ?? "", ogImageUrl: product?.seo.ogImage ?? "",
  }));
  const [specs, setSpecs] = useState<SpecRow[]>(() => product?.specifications.flatMap((g) => g.items.map((i) => ({ group: g.group, name: i.name, value: i.value, unit: i.unit ?? "" }))) ?? []);
  const [specsDirty, setSpecsDirty] = useState(false);
  const [media, setMedia] = useState<MediaRow[]>(() => product?.media.map((m) => ({ url: m.url, alt: m.alt ?? "", isPrimary: m.isPrimary })) ?? []);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof s, v: string) => setS((p) => ({ ...p, [k]: v }));
  const list = (v: string, sep: RegExp) => v.split(sep).map((x) => x.trim()).filter(Boolean);

  const save = useAdminMutation(async () => {
    const e: Record<string, string> = {};
    if (s.name.trim().length < 2) e.name = "Name is required";
    if (!s.categoryId) e.categoryId = "Choose a category";
    if (s.shortDescription.length > 500) e.shortDescription = "Max 500 characters";
    const specPayload = specs.filter((r) => r.name.trim() && r.value.trim()).map((r) => ({ key: snake(r.name), name: r.name.trim(), group: r.group.trim() || undefined, unit: r.unit.trim() || undefined, value: r.value.trim() }));
    const keys = specPayload.map((x) => x.key);
    if (new Set(keys).size !== keys.length) e.specs = "Duplicate specification names";
    const mediaPayload = media.filter((m) => m.url.trim()).map((m, i) => ({ type: "IMAGE" as const, url: m.url.trim(), alt: m.alt.trim() || undefined, isPrimary: m.isPrimary, sortOrder: i }));
    if (mediaPayload.length && !mediaPayload.some((m) => m.isPrimary)) mediaPayload[0].isPrimary = true;
    const variantPayload = edit ? [] : variants.map((v, i) => {
      const price = rupeesToMinor(v.price), compare = v.compareAt ? rupeesToMinor(v.compareAt) : null, cost = v.cost ? rupeesToMinor(v.cost) : null;
      if (!v.sku.trim()) e[`v${i}`] = "SKU required"; else if (price === null) e[`v${i}`] = "Valid price required"; else if (compare !== null && compare < price) e[`v${i}`] = "Compare-at must be ≥ price";
      const options = list(v.options, /[;\n]/).map((o) => { const [k, ...rest] = o.split("="); return { key: snake(k), name: k.trim(), value: rest.join("=").trim() }; }).filter((o) => o.key && o.value);
      return { sku: v.sku.trim(), name: v.name.trim() || undefined, price: price ?? 0, compareAtPrice: compare, costPrice: cost, weightGrams: Math.max(0, parseInt(v.weight) || 0), isDefault: i === 0, options, stock: { quantity: Math.max(0, parseInt(v.qty) || 0), lowStockThreshold: Math.max(0, parseInt(v.threshold) || 0), allowBackorder: v.backorder } };
    });
    if (!edit && new Set(variantPayload.map((v) => v.sku.toLowerCase())).size !== variantPayload.length) e.variants = "Duplicate SKUs in this form";
    setErrors(e);
    if (Object.keys(e).length) throw new Error("Please fix the highlighted fields");

    const flag = (v: string) => (v === "keep" ? undefined : v === "yes");
    const common = {
      name: s.name.trim(), shortDescription: s.shortDescription.trim() || undefined, description: s.description.trim() || undefined, status: s.status,
      brandId: s.brandId || (edit ? null : undefined), categoryId: s.categoryId, productType: s.productType || undefined,
      taxRatePercent: Number(s.taxRatePercent) || 0, hsnCode: s.hsnCode.trim() || undefined, maxQuantityPerOrder: Math.max(1, parseInt(s.maxQty) || 10),
      isFeatured: edit ? flag(s.isFeatured) : s.isFeatured === "yes", isBestseller: edit ? flag(s.isBestseller) : s.isBestseller === "yes", isNewArrival: edit ? flag(s.isNewArrival) : s.isNewArrival === "yes",
      highlights: list(s.highlights, /\n/).slice(0, 10), tags: list(s.tags, /,/), badges: list(s.badges, /,/).slice(0, 5),
      seoTitle: s.seoTitle.trim() || undefined, seoDescription: s.seoDescription.trim() || undefined, seoKeywords: list(s.seoKeywords, /,/), canonicalUrl: s.canonicalUrl.trim() || undefined, ogImageUrl: s.ogImageUrl.trim() || undefined,
      ...(s.slug.trim() ? { slug: s.slug.trim() } : {}),
    };
    if (!edit) return (await api.post<{ id: string }>("/admin/products", { ...common, attributes: specPayload, media: mediaPayload, variants: variantPayload })).data;
    return (await api.patch<unknown>(`/admin/products/${product!.id}`, { ...common, ...(specsDirty ? { attributes: specPayload } : {}), ...(mediaDirty ? { media: mediaPayload } : {}) })).data;
  }, { success: edit ? "Product saved" : "Product created", onSuccess: (r) => { if (!edit) router.replace(`/admin/products/${(r as { id: string }).id}`); } });

  const serverFields = useMemo<Record<string, string>>(() => (save.error instanceof ApiError ? Object.fromEntries((save.error.details?.fields ?? []).map((f) => [f.path, f.message])) : {}), [save.error]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: MediaRow[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("folder", "products");
        added.push({ url: (await api.upload<{ url: string }>("/admin/media/upload", fd)).data.url, alt: "", isPrimary: false });
      }
      setMedia((m) => [...m, ...added]);
      setMediaDirty(true);
      toast.success(`${added.length} image(s) uploaded`);
    } catch (e) { toast.fail(e); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const flagSelect = (k: "isFeatured" | "isBestseller" | "isNewArrival", label: string) => (
    <Field label={label}>{(id) => <Select id={id} value={s[k]} onChange={(e) => set(k, e.target.value)}>{edit && <option value="keep">(unchanged)</option>}<option value="yes">Yes</option><option value="no">No</option></Select>}</Field>
  );
  const dupSkuHint = useMemo(() => (serverFields["variants"] ? String(serverFields["variants"]) : ""), [serverFields]);

  return (
    <div className="space-y-5 pb-24">
      <Card title="1 · Basic information">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Product name" required error={errors.name ?? serverFields.name}>{(id) => <Input id={id} value={s.name} onChange={(e) => set("name", e.target.value)} maxLength={200} />}</Field></div>
          <Field label="Slug" hint="Blank = generated from the name. Must be unique." error={serverFields.slug}>{(id) => <Input id={id} value={s.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto" />}</Field>
          <Field label="Publication status" hint="Only “Published” products appear on the storefront.">{(id) => <Select id={id} value={s.status} onChange={(e) => set("status", e.target.value)}><option value="DRAFT">Draft</option><option value="ACTIVE">Published</option><option value="ARCHIVED">Archived</option></Select>}</Field>
          <div className="sm:col-span-2"><Field label="Short description" error={errors.shortDescription}>{(id) => <Textarea id={id} value={s.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="min-h-16" maxLength={500} />}</Field></div>
          <div className="sm:col-span-2"><Field label="Full description" hint="Plain text; shown on the product page.">{(id) => <Textarea id={id} value={s.description} onChange={(e) => set("description", e.target.value)} className="min-h-40" maxLength={20000} />}</Field></div>
          <div className="sm:col-span-2"><Field label="Highlights (one per line, max 10)">{(id) => <Textarea id={id} value={s.highlights} onChange={(e) => set("highlights", e.target.value)} className="min-h-24" />}</Field></div>
        </div>
      </Card>

      <Card title="2 · Brand, category & classification">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" required error={errors.categoryId ?? serverFields.categoryId}>{(id) => <Select id={id} value={s.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">Select…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{"— ".repeat(c.depth ?? 0)}{c.name}</option>)}</Select>}</Field>
          <Field label="Brand">{(id) => <Select id={id} value={s.brandId} onChange={(e) => set("brandId", e.target.value)}><option value="">No brand</option>{brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>
          <Field label="Tags (comma separated)">{(id) => <Input id={id} value={s.tags} onChange={(e) => set("tags", e.target.value)} />}</Field>
          <Field label="Badges (comma separated, max 5)">{(id) => <Input id={id} value={s.badges} onChange={(e) => set("badges", e.target.value)} />}</Field>
          {flagSelect("isFeatured", "Featured")}{flagSelect("isBestseller", "Bestseller")}{flagSelect("isNewArrival", "New arrival")}
        </div>
      </Card>

      <Card title="3 · Images & gallery" actions={<><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => upload(e.target.files)} /><Btn size="sm" loading={uploading} onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Upload</Btn><Btn size="sm" onClick={() => { setMedia([...media, { url: "", alt: "", isPrimary: media.length === 0 }]); setMediaDirty(true); }}><ImagePlus className="size-3.5" /> Add URL</Btn></>}>
        {media.length === 0 ? <p className="text-sm text-slate-500">No images yet. Uploads are content-sniffed on the server (JPEG, PNG, WebP, AVIF); the declared type is never trusted. Cloud storage is {`not configured unless STORAGE_PROVIDER is s3/cloudinary — local storage is used for development`}.</p> : (
          <ul className="space-y-2.5">
            {media.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-2.5">
                { }
                <Thumb src={m.url} alt={m.alt} className="size-14 rounded-md border border-slate-200 object-cover" />
                <Input aria-label="Image URL" value={m.url} onChange={(e) => { setMedia(media.map((x, j) => (j === i ? { ...x, url: e.target.value } : x))); setMediaDirty(true); }} placeholder="https://… or /uploads/…" className="min-w-52 flex-1" />
                <Input aria-label="Alt text" value={m.alt} onChange={(e) => { setMedia(media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x))); setMediaDirty(true); }} placeholder="Alt text" className="w-52" />
                <label className="flex items-center gap-1 text-xs"><input type="radio" name="primary" checked={m.isPrimary} onChange={() => { setMedia(media.map((x, j) => ({ ...x, isPrimary: j === i }))); setMediaDirty(true); }} /> Primary</label>
                <div className="flex gap-1">
                  <Btn size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...media]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setMedia(n); setMediaDirty(true); }}>↑</Btn>
                  <Btn size="sm" variant="ghost" aria-label="Move down" disabled={i === media.length - 1} onClick={() => { const n = [...media]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setMedia(n); setMediaDirty(true); }}>↓</Btn>
                  <Btn size="sm" variant="ghost" aria-label="Remove image" className="text-rose-600" onClick={() => { setMedia(media.filter((_, j) => j !== i)); setMediaDirty(true); }}><Trash2 className="size-3.5" /></Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
        {edit && mediaDirty && <p className="mt-2 text-xs text-amber-700">Saving replaces the product’s image set with the list above.</p>}
      </Card>

      <Card title="4 · Electronics specifications" actions={<Select aria-label="Add specification template" value="" onChange={(e) => { const t = SPEC_TEMPLATES[e.target.value]; if (t) { const have = new Set(specs.map((r) => snake(r.name))); setSpecs([...specs, ...t.filter((r) => !have.has(snake(r.name)))]); setSpecsDirty(true); } }} className="w-48"><option value="">Add from template…</option>{Object.keys(SPEC_TEMPLATES).map((k) => <option key={k} value={k}>{k}</option>)}</Select>}>
        <p className="mb-3 text-xs text-slate-500">Templates are starting points only — fill the rows relevant to this product and delete the rest. Rows with an empty value are not saved. Use manufacturer-published figures (e.g. battery capacity), never estimates.</p>
        {errors.specs && <p role="alert" className="mb-2 text-xs text-rose-600">{errors.specs}</p>}
        {serverFields.attributes && <p role="alert" className="mb-2 text-xs text-rose-600">{serverFields.attributes}</p>}
        <div className="space-y-2">
          {specs.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr_90px_auto]">
              {(["group", "name", "value", "unit"] as const).map((k) => <Input key={k} aria-label={`Spec ${k} ${i + 1}`} placeholder={k[0].toUpperCase() + k.slice(1)} value={r[k]} onChange={(e) => { setSpecs(specs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x))); setSpecsDirty(true); }} className={k === "value" ? "col-span-2 sm:col-span-1" : ""} />)}
              <Btn variant="ghost" size="sm" aria-label="Remove specification" className="text-rose-600" onClick={() => { setSpecs(specs.filter((_, j) => j !== i)); setSpecsDirty(true); }}><Trash2 className="size-3.5" /></Btn>
            </div>
          ))}
        </div>
        <Btn size="sm" className="mt-3" onClick={() => { setSpecs([...specs, { group: "", name: "", value: "", unit: "" }]); setSpecsDirty(true); }}><Plus className="size-3.5" /> Add row</Btn>
        {edit && specsDirty && <p className="mt-2 text-xs text-amber-700">Saving replaces all specifications of this product with the rows above.</p>}
      </Card>

      {!edit ? (
        <Card title="5 · Variants, pricing & opening stock" actions={<Btn size="sm" onClick={() => setVariants([...variants, emptyVariant()])}><Plus className="size-3.5" /> Add variant</Btn>}>
          {(errors.variants || dupSkuHint) && <p role="alert" className="mb-2 text-xs text-rose-600">{errors.variants ?? dupSkuHint}</p>}
          <p className="mb-3 text-xs text-slate-500">Prices in ₹. The first variant is the default. Options format: <code>colour=Black; storage=256 GB</code>. Opening stock is recorded in the inventory ledger.</p>
          <div className="space-y-3">
            {variants.map((v, i) => {
              const up = (k: keyof VariantRow, val: string | boolean) => setVariants(variants.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
              return (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <Field label="SKU" required>{(id) => <Input id={id} value={v.sku} onChange={(e) => up("sku", e.target.value)} />}</Field>
                    <Field label="Variant name">{(id) => <Input id={id} value={v.name} onChange={(e) => up("name", e.target.value)} />}</Field>
                    <Field label="Price (₹)" required>{(id) => <Input id={id} inputMode="decimal" value={v.price} onChange={(e) => up("price", e.target.value)} />}</Field>
                    <Field label="Compare-at (₹)">{(id) => <Input id={id} inputMode="decimal" value={v.compareAt} onChange={(e) => up("compareAt", e.target.value)} />}</Field>
                    <Field label="Cost (₹)">{(id) => <Input id={id} inputMode="decimal" value={v.cost} onChange={(e) => up("cost", e.target.value)} />}</Field>
                    <Field label="Weight (g)">{(id) => <Input id={id} inputMode="numeric" value={v.weight} onChange={(e) => up("weight", e.target.value)} />}</Field>
                    <div className="sm:col-span-3"><Field label="Options">{(id) => <Input id={id} value={v.options} onChange={(e) => up("options", e.target.value)} placeholder="colour=Black; storage=256 GB" />}</Field></div>
                    <Field label="Opening stock">{(id) => <Input id={id} inputMode="numeric" value={v.qty} onChange={(e) => up("qty", e.target.value)} />}</Field>
                    <Field label="Low-stock at">{(id) => <Input id={id} inputMode="numeric" value={v.threshold} onChange={(e) => up("threshold", e.target.value)} />}</Field>
                    <div className="flex items-end"><Toggle checked={v.backorder} onChange={(x) => up("backorder", x)} label="Allow backorder" /></div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {errors[`v${i}`] ? <p role="alert" className="text-xs text-rose-600">{errors[`v${i}`]}</p> : <span />}
                    {variants.length > 1 && <Btn size="sm" variant="ghost" className="text-rose-600" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /> Remove</Btn>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <VariantsPanel productId={product!.id} variants={product!.variants} />
      )}

      <Card title="6 · Tax, ordering & shipping">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tax rate (GST %)">{(id) => <Input id={id} inputMode="decimal" value={s.taxRatePercent} onChange={(e) => set("taxRatePercent", e.target.value)} />}</Field>
          <Field label="HSN code">{(id) => <Input id={id} value={s.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} placeholder={edit ? "(unchanged if blank)" : "8517"} />}</Field>
          <Field label="Max quantity per order">{(id) => <Input id={id} inputMode="numeric" value={s.maxQty} onChange={(e) => set("maxQty", e.target.value)} />}</Field>
          <Field label="Product type">{(id) => <Input id={id} value={s.productType} onChange={(e) => set("productType", e.target.value)} />}</Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">Shipping weight is set per variant. Warranty length is captured as a specification row (“Warranty”). Dimensions are specification rows too — there is no separate shipping-dimensions field in the data model.</p>
      </Card>

      <Card title="7 · SEO">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SEO title">{(id) => <Input id={id} value={s.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={160} />}</Field>
          <Field label="Keywords (comma separated)">{(id) => <Input id={id} value={s.seoKeywords} onChange={(e) => set("seoKeywords", e.target.value)} />}</Field>
          <div className="sm:col-span-2"><Field label="SEO description">{(id) => <Textarea id={id} value={s.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className="min-h-16" maxLength={320} />}</Field></div>
          <Field label="Canonical URL">{(id) => <Input id={id} type="url" value={s.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} />}</Field>
          <Field label="Social image URL">{(id) => <Input id={id} value={s.ogImageUrl} onChange={(e) => set("ogImageUrl", e.target.value)} />}</Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{save.isError ? <span role="alert" className="text-rose-600">{(save.error as Error).message}</span> : edit ? "Changes are audited and go live immediately for published products." : "New products start as drafts unless you choose Published."}</p>
          <div className="flex gap-2"><Btn onClick={() => router.push("/admin/products")}>Cancel</Btn><Btn variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{edit ? "Save changes" : "Create product"}</Btn></div>
        </div>
      </div>
    </div>
  );
}

function VariantsPanel({ productId, variants }: { productId: string; variants: Detail["variants"] }) {
  const [adding, setAdding] = useState<VariantRow | null>(null);
  const [edits, setEdits] = useState<Record<string, { price: string; compareAt: string }>>({});
  const toast = useToast();
  const update = useAdminMutation((v: { id: string; price: number; compareAtPrice: number | null }) => api.patch(`/admin/variants/${v.id}`, { price: v.price, compareAtPrice: v.compareAtPrice }), { success: "Variant price updated", invalidate: ["product", "products"] });
  const add = useAdminMutation(async (v: VariantRow) => {
    const price = rupeesToMinor(v.price);
    if (!v.sku.trim() || price === null) throw new Error("SKU and a valid price are required");
    const options = v.options.split(/[;\n]/).map((o) => { const [k, ...r] = o.split("="); return { key: snake(k), name: k.trim(), value: r.join("=").trim() }; }).filter((o) => o.key && o.value);
    return api.post(`/admin/products/${productId}/variants`, { sku: v.sku.trim(), name: v.name.trim() || undefined, price, compareAtPrice: v.compareAt ? rupeesToMinor(v.compareAt) : null, weightGrams: parseInt(v.weight) || 0, options, stock: { quantity: parseInt(v.qty) || 0, lowStockThreshold: parseInt(v.threshold) || 0, allowBackorder: v.backorder } });
  }, { success: "Variant added", onSuccess: () => setAdding(null) });
  return (
    <Card title="5 · Variants & pricing" actions={<Btn size="sm" onClick={() => setAdding(emptyVariant())}><Plus className="size-3.5" /> Add variant</Btn>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">SKU</th><th>Name</th><th className="w-32">Price (₹)</th><th className="w-32">Compare-at (₹)</th><th className="text-right">Available</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((v) => {
              const e = edits[v.id] ?? { price: minorToRupees(v.price.price), compareAt: minorToRupees(v.price.compareAtPrice) };
              const dirty = e.price !== minorToRupees(v.price.price) || e.compareAt !== minorToRupees(v.price.compareAtPrice);
              return (
                <tr key={v.id}>
                  <td className="py-2 font-mono text-xs">{v.sku} {v.isDefault && <Badge tone="accent">default</Badge>}</td><td>{v.name}</td>
                  <td><Input aria-label={`Price ${v.sku}`} value={e.price} onChange={(x) => setEdits({ ...edits, [v.id]: { ...e, price: x.target.value } })} /></td>
                  <td><Input aria-label={`Compare-at ${v.sku}`} value={e.compareAt} onChange={(x) => setEdits({ ...edits, [v.id]: { ...e, compareAt: x.target.value } })} /></td>
                  <td className="text-right tabular-nums">{v.availability.available}</td>
                  <td className="pl-2 text-right"><Btn size="sm" variant="primary" disabled={!dirty} loading={update.isPending} onClick={() => { const p = rupeesToMinor(e.price); const c = e.compareAt ? rupeesToMinor(e.compareAt) : null; if (p === null || (e.compareAt && c === null)) return toast.error("Enter valid amounts"); update.mutate({ id: v.id, price: p, compareAtPrice: c }); }}>Save price</Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Price changes apply to new purchases only and are audited. Stock is managed under Inventory.</p>
      {adding && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {([["sku", "SKU"], ["name", "Name"], ["price", "Price (₹)"], ["compareAt", "Compare-at (₹)"], ["options", "Options (colour=Black)"], ["qty", "Opening stock"], ["threshold", "Low-stock at"], ["weight", "Weight (g)"]] as const).map(([k, label]) => (
              <Field key={k} label={label}>{(id) => <Input id={id} value={adding[k]} onChange={(e) => setAdding({ ...adding, [k]: e.target.value })} />}</Field>
            ))}
          </div>
          <div className="mt-3 flex gap-2"><Btn variant="primary" loading={add.isPending} onClick={() => add.mutate(adding)}>Add variant</Btn><Btn onClick={() => setAdding(null)}>Cancel</Btn></div>
        </div>
      )}
    </Card>
  );
}
