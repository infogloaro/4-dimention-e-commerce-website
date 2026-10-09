/**
 * 4D Commerce — Four Dimension Electronics
 * Development catalogue. Strictly legitimate consumer electronics only.
 * Brands and products are realistic electronics benchmarks.
 * Images are the local illustrations in public/catalog (see product-art.ts) — replace via admin media upload.
 */

export interface CategorySeed {
  name: string;
  slug: string;
  description: string;
  icon: string;
  featured?: boolean;
  children?: Array<Omit<CategorySeed, "children">>;
}

export const CATEGORIES: CategorySeed[] = [
  {
    name: "Electronics",
    slug: "electronics",
    icon: "zap",
    featured: true,
    description: "Premium smartphones, computing, audio, gaming gear and smart electronics.",
    children: [
      { name: "Smartphones", slug: "smartphones", icon: "smartphone", description: "Flagship, creator and everyday 5G smartphones.", featured: true },
      { name: "Tablets & E-Readers", slug: "tablets", icon: "tablet", description: "High-resolution OLED tablets and digital slates." },
      { name: "Laptops & Ultrabooks", slug: "laptops", icon: "laptop", description: "Featherweight ultrabooks, creator notebooks and student laptops.", featured: true },
      { name: "Gaming Laptops", slug: "gaming-laptops", icon: "cpu", description: "High-refresh rate laptops with dedicated graphics.", featured: true },
      { name: "Headphones & Audio", slug: "audio", icon: "headphones", description: "Studio ANC headphones, wireless earbuds and audiophile speakers.", featured: true },
      { name: "Smart Wearables", slug: "wearables", icon: "watch", description: "AMOLED smartwatches, fitness trackers and health wearables.", featured: true },
      { name: "Monitors & Displays", slug: "monitors", icon: "monitor", description: "OLED gaming monitors, 4K creator panels and ultra-wides.", featured: true },
      { name: "Computer Components", slug: "components", icon: "cpu", description: "Processors, graphics cards, NVMe SSDs and high-speed RAM." },
      { name: "Gaming Gear", slug: "gaming-gear", icon: "gamepad-2", description: "Mechanical keyboards, ultralight gaming mice and controllers.", featured: true },
      { name: "Cameras & Photography", slug: "cameras", icon: "camera", description: "Mirrorless 4K cameras, action cams and lenses." },
      { name: "Networking & Power", slug: "networking", icon: "wifi", description: "Wi-Fi 7 mesh routers, GaN fast chargers and high-speed cables." },
    ],
  },
];

export const BRANDS = [
  { name: "Nimbus", slug: "nimbus", featured: true, description: "Smartphones, tablets and mobile computing engineered for speed and battery life." },
  { name: "Voltix", slug: "voltix", featured: true, description: "Performance ultrabooks, creator workstations and gaming machines." },
  { name: "Aurora Audio", slug: "aurora-audio", featured: true, description: "Studio-grade ANC headphones, lossless earbuds and high-fidelity sound." },
  { name: "Kora Tech", slug: "kora-tech", featured: true, description: "Precision AMOLED smartwatches and continuous health tracking wearables." },
  { name: "Apex Silicon", slug: "apex-silicon", featured: true, description: "High-performance desktop processors, graphics processing units and chipsets." },
  { name: "Horizon Display", slug: "horizon-display", featured: true, description: "Calibrated 4K QD-OLED creator monitors and high-refresh gaming displays." },
  { name: "Quantum Play", slug: "quantum-play", featured: true, description: "Esports-grade mechanical keyboards, wireless mice and gaming controllers." },
  { name: "Optix Pro", slug: "optix-pro", description: "Compact mirrorless cameras, 4K action cameras and optical hardware." },
  { name: "NetPulse", slug: "netpulse", description: "Next-generation Wi-Fi 7 tri-band mesh systems and high-throughput networking." },
  { name: "HyperDrive", slug: "hyperdrive", featured: true, description: "Ultra-fast PCIe Gen4/Gen5 NVMe SSDs, external storage and GaN fast chargers." },
];

export const ATTRIBUTES = [
  { key: "color", name: "Colour", kind: "VARIANT_OPTION" as const },
  { key: "storage", name: "Storage", kind: "VARIANT_OPTION" as const },
  { key: "memory", name: "Memory", kind: "VARIANT_OPTION" as const },
  { key: "size", name: "Display Size", kind: "VARIANT_OPTION" as const },
];

type Spec = Record<string, Record<string, string>>;
interface VariantAxis {
  color?: Array<[string, string]>;
  storage?: Array<[string, number]>;
  memory?: Array<[string, number]>;
  size?: string[];
}

export interface ProductSeed {
  name: string;
  cat: string;
  brand: string;
  /** base price in INR rupees */
  price: number;
  mrp?: number;
  short: string;
  description: string;
  highlights: string[];
  specs: Spec;
  axes: VariantAxis;
  tags: string[];
  stock?: number;
  tax?: number;
  flags?: { featured?: boolean; bestseller?: boolean; new?: boolean };
  badges?: string[];
  weight?: number;
}

const colors = {
  black: ["Space Black", "#111111"] as [string, string],
  silver: ["Titanium Silver", "#C9CCD1"] as [string, string],
  blue: ["Deep Navy", "#1F2A44"] as [string, string],
  green: ["Emerald Green", "#1B4D3E"] as [string, string],
  white: ["Glacier White", "#F4F1EA"] as [string, string],
  grey: ["Graphite Grey", "#4A4D52"] as [string, string],
};

export const PRODUCTS: ProductSeed[] = [
  // ── Smartphones ──
  {
    name: "Nimbus Nova 5 Pro",
    cat: "smartphones",
    brand: "nimbus",
    price: 79999,
    mrp: 89999,
    short: "6.7\" LTPO OLED, triple 50MP cameras, 100W fast charging.",
    description: "Nova 5 Pro pairs a 120Hz LTPO OLED display with a 3nm flagship processor and a 50MP triple-camera system tuned for low light. 100W wired and 50W wireless charging ensure maximum uptime.",
    highlights: ["6.7\" 120Hz LTPO OLED, 2600 nits peak brightness", "Triple 50MP camera with 5x periscope optical zoom", "5,000 mAh battery, 100W fast charging", "IP68 water & dust resistance", "1 Year Manufacturer Warranty"],
    specs: {
      Display: { Size: "6.7 inches", Type: "LTPO AMOLED", "Refresh rate": "120 Hz", Resolution: "3120 x 1440" },
      Performance: { Processor: "Nimbus N3 Flagship (3nm)", OS: "NimbusOS 5 (Android 15)" },
      Camera: { Rear: "50MP Main + 50MP Ultra-wide + 50MP 5x Periscope", Front: "32MP HDR" },
      Battery: { Capacity: "5000 mAh", Charging: "100W wired / 50W wireless" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.silver, colors.blue], storage: [["256 GB", 0], ["512 GB", 8000]], memory: [["12 GB", 0]] },
    tags: ["5g", "flagship", "amoled", "smartphones"],
    stock: 40,
    tax: 18,
    flags: { featured: true, bestseller: true },
    weight: 210,
  },
  {
    name: "Nimbus Nova 5",
    cat: "smartphones",
    brand: "nimbus",
    price: 54999,
    mrp: 59999,
    short: "6.5\" 120Hz AMOLED, 50MP dual camera, 67W fast charge.",
    description: "The Nova 5 delivers a flagship experience with a vibrant 120Hz AMOLED panel, dual 50MP optical stabilization cameras and an all-day 5,000 mAh battery.",
    highlights: ["6.5\" 120Hz AMOLED display", "Dual 50MP cameras with Optical Image Stabilization", "5,000 mAh battery with 67W fast charging", "1 Year Manufacturer Warranty"],
    specs: {
      Display: { Size: "6.5 inches", Type: "AMOLED", "Refresh rate": "120 Hz", Resolution: "2400 x 1080" },
      Performance: { Processor: "Nimbus N2 5G (4nm)", OS: "NimbusOS 5" },
      Battery: { Capacity: "5000 mAh", Charging: "67W wired fast charge" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.green, colors.white], storage: [["128 GB", 0], ["256 GB", 5000]] },
    tags: ["5g", "amoled", "smartphones"],
    stock: 60,
    flags: { bestseller: true },
    weight: 195,
  },
  {
    name: "Nimbus Lite 3",
    cat: "smartphones",
    brand: "nimbus",
    price: 17999,
    mrp: 21999,
    short: "Reliable 5G smartphone with 6.6\" 90Hz display and 5000 mAh battery.",
    description: "A dependable everyday 5G smartphone: large 5,000 mAh battery, crisp 90Hz display and a clean software experience with 3 years of guaranteed security updates.",
    highlights: ["6.6\" 90Hz FHD+ display", "5,000 mAh battery with 33W charging", "3 years of Android OS and security updates"],
    specs: {
      Display: { Size: "6.6 inches", Type: "IPS LCD", "Refresh rate": "90 Hz" },
      Performance: { Processor: "Nimbus G1 5G", OS: "NimbusOS 5" },
      Battery: { Capacity: "5000 mAh" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.blue, colors.black], storage: [["128 GB", 0]] },
    tags: ["5g", "budget", "smartphones"],
    stock: 120,
    flags: { new: true },
    weight: 188,
  },
  {
    name: "Nimbus Tab 11 Ultra",
    cat: "tablets",
    brand: "nimbus",
    price: 49999,
    mrp: 57999,
    short: "11\" 120Hz 2.5K OLED tablet, quad speakers, stylus and keyboard ready.",
    description: "The Tab 11 Ultra is designed for productivity and media: a stunning 2.5K OLED panel, quad Dolby Atmos speakers, and magnetic stylus support.",
    highlights: ["11\" 2.5K 120Hz OLED screen", "Quad speakers with Dolby Atmos tuning", "8,400 mAh battery with 45W fast charging", "Magnetic Active Stylus support"],
    specs: {
      Display: { Size: "11.0 inches", Type: "OLED", Resolution: "2560 x 1600", "Refresh rate": "120 Hz" },
      Performance: { Processor: "Nimbus T2 Octa-Core", OS: "NimbusOS Pad" },
      Battery: { Capacity: "8400 mAh", Charging: "45W fast charge" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.silver, colors.grey], storage: [["128 GB", 0], ["256 GB", 6000]] },
    tags: ["tablet", "oled", "stylus"],
    stock: 35,
    flags: { featured: true },
    weight: 480,
  },

  // ── Laptops ──
  {
    name: "Voltix Aero 14 Ultrabook",
    cat: "laptops",
    brand: "voltix",
    price: 94990,
    mrp: 109990,
    short: "14\" 2.8K OLED, 1.2 kg magnesium chassis, 18-hour battery, Wi-Fi 7.",
    description: "Aero 14 is a featherweight 1.2 kg ultrabook featuring an ultra-crisp 2.8K 120Hz OLED display, an ergonomic backlit keyboard, Thunderbolt 4 and all-day battery endurance.",
    highlights: ["14\" 2.8K 120Hz OLED, 100% DCI-P3 color gamut", "1.2 kg magnesium-aluminum chassis", "Up to 18 hours battery life", "Wi-Fi 7 & Dual Thunderbolt 4 ports", "2 Years Premium On-Site Warranty"],
    specs: {
      Display: { Size: "14 inches", Resolution: "2880 x 1800", Type: "OLED 120Hz" },
      Performance: { Processor: "Voltix V7 Ultra (12-Core)", Graphics: "Integrated Arc 8-Core Xe" },
      Connectivity: { Ports: "2x Thunderbolt 4, 1x USB-A 3.2, HDMI 2.1", Wireless: "Wi-Fi 7, Bluetooth 5.4" },
      Battery: { Capacity: "75 Wh", Charging: "65W USB-C GaN" },
      Warranty: { Duration: "2 Years", Coverage: "On-Site Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.grey, colors.silver], memory: [["16 GB", 0], ["32 GB", 12000]], storage: [["512 GB", 0], ["1 TB", 9000]] },
    tags: ["ultrabook", "oled", "laptop", "lightweight"],
    stock: 25,
    flags: { featured: true, new: true },
    weight: 1200,
  },
  {
    name: "Voltix Forge 16 Creator",
    cat: "gaming-laptops",
    brand: "voltix",
    price: 164990,
    mrp: 179990,
    short: "16\" 4K mini-LED, RTX 4080-class graphics, vapor-chamber cooling.",
    description: "A portable workstation for video editors, 3D artists and gamers: color-accurate 4K mini-LED display, dedicated 12GB high-power GPU, and dual vapor-chamber cooling.",
    highlights: ["16\" 4K 165Hz mini-LED, 100% DCI-P3, HDR 1000", "Dedicated 12GB GPU with 175W Max TGP", "Dual vapor-chamber cooling with liquid metal", "2 Years On-Site Comprehensive Warranty"],
    specs: {
      Display: { Size: "16 inches", Resolution: "3840 x 2400", Type: "Mini-LED 165Hz" },
      Performance: { Processor: "Voltix V9 HX (16-Core)", Graphics: "Dedicated 12GB GDDR6" },
      Battery: { Capacity: "99 Wh", Charging: "240W Fast Charger" },
      Warranty: { Duration: "2 Years", Coverage: "Comprehensive Hardware Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black], memory: [["32 GB", 0], ["64 GB", 18000]], storage: [["1 TB", 0], ["2 TB", 16000]] },
    tags: ["creator", "gaming", "laptop", "mini-led"],
    stock: 12,
    weight: 2300,
  },
  {
    name: "Voltix Go 15 Everyday Laptop",
    cat: "laptops",
    brand: "voltix",
    price: 42990,
    mrp: 52990,
    short: "15.6\" FHD anti-glare, 8-core processor, fast PCIe NVMe SSD.",
    description: "A fast, practical laptop for study and office work featuring a roomy anti-glare display, comfortable keyboard with numeric keypad, and fast USB-C PD charging.",
    highlights: ["15.6\" FHD IPS anti-glare screen", "8-Core processor with 16GB DDR5 RAM", "Fast USB-C Power Delivery charging", "1 Year Brand Warranty"],
    specs: {
      Display: { Size: "15.6 inches", Resolution: "1920 x 1080", Type: "IPS Anti-glare" },
      Performance: { Processor: "Voltix V5 Octa-Core", Graphics: "Integrated UHD" },
      Battery: { Capacity: "54 Wh", Life: "Up to 9 hours" },
      Warranty: { Duration: "1 Year", Coverage: "Standard Brand Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.silver, colors.grey], memory: [["8 GB", 0], ["16 GB", 4500]], storage: [["512 GB", 0]] },
    tags: ["student", "budget", "laptop"],
    stock: 50,
    weight: 1700,
  },

  // ── Audio ──
  {
    name: "Aurora Studio ANC Headphones",
    cat: "audio",
    brand: "aurora-audio",
    price: 18999,
    mrp: 24999,
    short: "Over-ear, hybrid ANC, 40mm drivers, 60-hour battery, LDAC.",
    description: "Studio-tuned 40mm biocellulose drivers, adaptive hybrid noise cancellation and memory-foam cushions for all-day listening with lossless LDAC audio transmission.",
    highlights: ["Hybrid ANC with ambient sound mode", "60-hour playtime (ANC off) / 45-hour (ANC on)", "Multipoint Bluetooth 5.4 connection", "LDAC & aptX Lossless support", "1 Year Brand Warranty"],
    specs: {
      Audio: { Driver: "40 mm biocellulose dynamic", Codecs: "LDAC, aptX Lossless, AAC, SBC", "Frequency response": "10 Hz - 40,000 Hz" },
      Battery: { Playtime: "60 hours", "Fast charge": "10 mins = 8 hours playback" },
      Connectivity: { Bluetooth: "Version 5.4 with Multipoint", Wired: "3.5mm audio jack & USB-C audio" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Replacement Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.silver, colors.blue] },
    tags: ["anc", "wireless", "over-ear", "audio"],
    stock: 80,
    flags: { featured: true, bestseller: true },
    weight: 270,
  },
  {
    name: "Aurora Buds Air 2",
    cat: "audio",
    brand: "aurora-audio",
    price: 7999,
    mrp: 10999,
    short: "True wireless earbuds with adaptive ANC and IPX5 water resistance.",
    description: "Compact wireless earbuds delivering balanced acoustic sound, active noise suppression, clear voice call mics and a pocketable Qi-compatible wireless charging case.",
    highlights: ["Adaptive Active Noise Cancellation up to 45dB", "30 hours total battery life with charging case", "IPX5 sweat and water resistance", "Wireless Qi charging case"],
    specs: {
      Audio: { Driver: "11 mm titanium dynamic", Codecs: "AAC, SBC, LHDC" },
      Battery: { Playtime: "8 hours earbuds + 22 hours case", Charging: "USB-C & Qi Wireless" },
      Durability: { "Water resistance": "IPX5 rated" },
      Warranty: { Duration: "1 Year", Coverage: "Brand Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.white, colors.black, colors.green] },
    tags: ["tws", "anc", "earbuds", "audio"],
    stock: 150,
    flags: { bestseller: true },
    weight: 55,
  },
  {
    name: "Aurora Boom Portable Speaker",
    cat: "audio",
    brand: "aurora-audio",
    price: 5499,
    mrp: 6999,
    short: "Rugged Bluetooth speaker, 30W output, IP67 waterproof, 20-hour battery.",
    description: "A waterproof Bluetooth speaker engineered for outdoor clarity with deep bass radiators, dual 15W drivers and a rugged shockproof housing.",
    highlights: ["IP67 dustproof and waterproof", "30W peak stereo output with dual passive radiators", "20 hours continuous music playback", "PartyLink multi-speaker sync"],
    specs: {
      Audio: { Output: "30W Stereo", Drivers: "Dual 48mm active + Dual passive bass radiators" },
      Battery: { Playtime: "20 hours", Capacity: "5200 mAh" },
      Durability: { Ingress: "IP67 Submersible" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.blue, colors.green] },
    tags: ["speaker", "waterproof", "audio", "bluetooth"],
    stock: 90,
    weight: 640,
  },

  // ── Smart Wearables ──
  {
    name: "Kora Pulse Smartwatch",
    cat: "wearables",
    brand: "kora-tech",
    price: 12999,
    mrp: 16999,
    short: "1.43\" AMOLED smartwatch with dual GPS, SpO2 and 10-day battery.",
    description: "Keep track of active training and vital metrics: crisp AMOLED display, independent dual-frequency GPS route mapping, heart rate, sleep stages, and 10 days of battery life.",
    highlights: ["1.43\" AMOLED always-on display, sapphire glass", "Dual-band multi-satellite GPS navigation", "10-day typical battery life", "5 ATM water resistance (swim proof)", "1 Year Official Warranty"],
    specs: {
      Display: { Size: "1.43 inches", Type: "AMOLED Always-On", Resolution: "466 x 466" },
      Sensors: { Health: "SpO2, Optical Heart Rate, Skin Temperature", Navigation: "Dual-band GPS, GLONASS, Galileo" },
      Battery: { Life: "Up to 10 days standard / 30 hours continuous GPS" },
      Durability: { Rating: "5 ATM water resistance" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.silver, colors.grey], size: ["42 mm", "46 mm"] },
    tags: ["smartwatch", "gps", "wearables", "fitness"],
    stock: 70,
    flags: { new: true, featured: true },
    weight: 45,
  },
  {
    name: "Kora Band 4",
    cat: "wearables",
    brand: "kora-tech",
    price: 2999,
    mrp: 3999,
    short: "Lightweight fitness band with heart-rate, SpO2 and 14-day battery.",
    description: "Compact fitness tracking that never gets in your way: continuous heart-rate, blood oxygen saturation tracking, sleep scoring and two full weeks between charges.",
    highlights: ["14-day battery life on a single charge", "100+ sports tracking modes", "Continuous blood oxygen (SpO2) and sleep monitoring", "5 ATM water resistance"],
    specs: {
      Display: { Size: "1.1 inches AMOLED" },
      Battery: { Life: "14 days typical use" },
      Durability: { Rating: "5 ATM swim proof" },
      Warranty: { Duration: "1 Year", Coverage: "Standard Brand Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.blue] },
    tags: ["band", "fitness", "wearables", "budget"],
    stock: 200,
    weight: 22,
  },

  // ── Monitors & Displays ──
  {
    name: "Horizon Vision 27 QHD 240Hz Gaming Monitor",
    cat: "monitors",
    brand: "horizon-display",
    price: 34999,
    mrp: 44999,
    short: "27\" Fast IPS, 2560x1440, 240Hz, 1ms GtG, USB-C 65W PD.",
    description: "Engineered for competitive gaming and precision tasks: Fast IPS panel with 240Hz refresh rate, 1ms response time, AMD FreeSync Premium Pro, and USB-C display connectivity with 65W power delivery.",
    highlights: ["27\" QHD (2560 x 1440) 240Hz Fast IPS panel", "1ms GtG response time with AMD FreeSync Premium Pro", "USB-C input with 65W Power Delivery", "3 Years Zero Bright Dot Panel Warranty"],
    specs: {
      Display: { Size: "27 inches", Resolution: "2560 x 1440 QHD", "Refresh rate": "240 Hz", Panel: "Fast IPS", "Response time": "1ms GtG" },
      Connectivity: { Video: "1x DisplayPort 1.4, 2x HDMI 2.1, 1x USB-C (DP Alt + 65W PD)" },
      Color: { Gamut: "98% DCI-P3, HDR400 certified" },
      Warranty: { Duration: "3 Years", Coverage: "On-Site Panel Replacement Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black] },
    tags: ["monitor", "gaming", "240hz", "ips"],
    stock: 28,
    flags: { featured: true, bestseller: true },
    weight: 6200,
  },
  {
    name: "Horizon Ultra 32 4K OLED Pro Display",
    cat: "monitors",
    brand: "horizon-display",
    price: 89999,
    mrp: 109999,
    short: "32\" 4K QD-OLED, 144Hz, 99% DCI-P3, HDR True Black 400, 90W PD.",
    description: "The ultimate display for creative color grading and high-end entertainment: self-lit QD-OLED panel offering infinite contrast, true blacks, factory-calibrated Delta E < 1 color accuracy, and 90W USB-C docking.",
    highlights: ["32\" 4K UHD (3840 x 2160) Quantum Dot OLED panel", "Factory calibrated Delta E < 1 with 99% DCI-P3 coverage", "VESA DisplayHDR True Black 400 certified", "90W USB-C hub with KVM switch", "3 Years Burn-In Warranty"],
    specs: {
      Display: { Size: "32 inches", Resolution: "3840 x 2160 4K", Type: "QD-OLED 144Hz", Contrast: "1,500,000:1" },
      Connectivity: { Ports: "2x HDMI 2.1, 1x DisplayPort 2.1, 1x USB-C 90W PD, KVM switch" },
      Warranty: { Duration: "3 Years", Coverage: "Comprehensive Panel & Burn-In Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.silver] },
    tags: ["monitor", "oled", "4k", "creator"],
    stock: 14,
    flags: { new: true },
    weight: 8900,
  },

  // ── Computer Components & Storage ──
  {
    name: "Apex Core X9 Desktop Processor",
    cat: "components",
    brand: "apex-silicon",
    price: 46999,
    mrp: 54999,
    short: "16-Core, 32-Thread 5.8 GHz desktop CPU, PCIe 5.0, 64MB L3 Cache.",
    description: "Apex Core X9 unlocks next-generation computational performance for gaming, compiling and heavy rendering workflows. Features 16 high-performance cores and PCIe 5.0 support.",
    highlights: ["16 Cores, 32 Threads, up to 5.8 GHz max boost", "64MB high-speed L3 cache", "PCIe 5.0 & DDR5-6000 support", "3 Years Manufacturer Warranty"],
    specs: {
      Performance: { Cores: "16 Cores / 32 Threads", "Base clock": "4.2 GHz", "Boost clock": "5.8 GHz", Cache: "64MB L3" },
      Platform: { Socket: "LGA-1851 / AM5 Compatible", "TDP rating": "125W" },
      Warranty: { Duration: "3 Years", Coverage: "Official Box Pack Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: {},
    tags: ["cpu", "processor", "components", "pc-build"],
    stock: 30,
    flags: { bestseller: true },
    weight: 120,
  },
  {
    name: "Apex Phantom RTX 4080 Graphics Card",
    cat: "components",
    brand: "apex-silicon",
    price: 114999,
    mrp: 129999,
    short: "16GB GDDR6X, triple axial fans, metal backplate, DLSS 3.5 & ray tracing.",
    description: "Extreme 4K graphics rendering power powered by 16GB GDDR6X high-speed VRAM, triple axial ball-bearing fans and reinforced vapor chamber heatsink.",
    highlights: ["16GB GDDR6X 256-bit memory", "Hardware ray tracing cores and DLSS 3.5 AI upscaling", "Triple axial cooling with 0dB silent fan mode", "3 Years Brand Replacement Warranty"],
    specs: {
      GPU: { Memory: "16GB GDDR6X", "Memory bus": "256-bit", Interface: "PCIe 4.0 x16" },
      Cooling: { Design: "Triple Fan Vapor Chamber heatsink", "Power connector": "1x 16-pin 12VHPWR" },
      Warranty: { Duration: "3 Years", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: {},
    tags: ["gpu", "graphics-card", "components", "gaming"],
    stock: 10,
    flags: { featured: true },
    weight: 1850,
  },
  {
    name: "HyperDrive Gen4 2TB NVMe SSD",
    cat: "components",
    brand: "hyperdrive",
    price: 13999,
    mrp: 17999,
    short: "PCIe 4.0 NVMe M.2 SSD, up to 7,400 MB/s read, graphene heat spreader.",
    description: "Rapid data throughput for gaming consoles and workstations: reads up to 7400 MB/s, writes up to 6800 MB/s, with intelligent SLC caching and durable 1200 TBW endurance.",
    highlights: ["Sequential read speeds up to 7,400 MB/s", "Sequential write speeds up to 6,800 MB/s", "Compatible with PS5 and high-end desktop PCs", "5 Years / 1200 TBW Limited Warranty"],
    specs: {
      Storage: { Interface: "PCIe Gen 4.0 x4, NVMe 2.0", "Form factor": "M.2 2280", "Read speed": "7400 MB/s", "Write speed": "6800 MB/s" },
      Durability: { Endurance: "1200 TBW" },
      Warranty: { Duration: "5 Years", Coverage: "Limited Warranty with TBW threshold" },
      Condition: { Condition: "Brand New" },
    },
    axes: { storage: [["1 TB", -5000], ["2 TB", 0], ["4 TB", 14000]] },
    tags: ["ssd", "nvme", "storage", "components"],
    stock: 75,
    weight: 45,
  },

  // ── Gaming Gear & Peripherals ──
  {
    name: "Quantum Strike Mechanical Gaming Keyboard",
    cat: "gaming-gear",
    brand: "quantum-play",
    price: 8999,
    mrp: 11999,
    short: "75% gasket-mount mechanical keyboard, hot-swappable switches, PBT keycaps.",
    description: "A precision mechanical keyboard engineered for competitive play and typing feel: gasket mounted, pre-lubed tactile switches, sound-dampening foam layers, tri-mode wireless connectivity, and per-key RGB backlighting.",
    highlights: ["75% compact layout with volume roller knob", "Hot-swappable switch sockets (3-pin & 5-pin)", "Tri-mode connectivity: 2.4GHz wireless, Bluetooth 5.2, USB-C wired", "Double-shot PBT keycaps that never shine", "1 Year Brand Warranty"],
    specs: {
      Keyboard: { Layout: "75% ANSI layout", Switches: "Pre-lubed Factory Tactile", Mount: "Silicone Gasket Mount" },
      Connectivity: { Modes: "2.4 GHz, Bluetooth 5.2, USB-C Wired", Battery: "4000 mAh rechargeable" },
      Warranty: { Duration: "1 Year", Coverage: "Official Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.white] },
    tags: ["keyboard", "gaming", "mechanical", "wireless"],
    stock: 65,
    flags: { bestseller: true },
    weight: 980,
  },
  {
    name: "Quantum Swift Wireless Gaming Mouse",
    cat: "gaming-gear",
    brand: "quantum-play",
    price: 4999,
    mrp: 6999,
    short: "58g lightweight, 26,000 DPI optical sensor, 4K polling wireless.",
    description: "Zero-drag competitive gaming mouse weighing just 58 grams without holes: flagship optical sensor, optical micro-switches rated for 90 million clicks, and up to 4000Hz polling rate.",
    highlights: ["Ultra-lightweight 58g ergonomic symmetrical design", "Flagship 26,000 DPI optical sensor with 650 IPS tracking", "Optical micro switches rated for 90 million clicks", "Up to 80 hours battery on 1000Hz polling"],
    specs: {
      Sensor: { Type: "Optical 26K DPI", Acceleration: "50G", MaxSpeed: "650 IPS" },
      Battery: { Runtime: "Up to 80 hours" },
      Weight: { Mouse: "58 grams" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.white] },
    tags: ["mouse", "gaming", "wireless", "lightweight"],
    stock: 85,
    weight: 58,
  },

  // ── Networking & Power Accessories ──
  {
    name: "NetPulse Tri-Band Wi-Fi 7 Mesh Router",
    cat: "networking",
    brand: "netpulse",
    price: 19999,
    mrp: 24999,
    short: "Tri-Band Wi-Fi 7, up to 9.3 Gbps, 2.5G WAN/LAN ports, covers 3,000 sq ft.",
    description: "Next-gen home and office wireless connectivity: supports ultra-wide 320 MHz channels on 6 GHz, MLO (Multi-Link Operation) for ultra-low latency, and dual 2.5Gbps Ethernet ports.",
    highlights: ["Tri-Band Wi-Fi 7 speeds up to 9.3 Gbps", "Multi-Link Operation (MLO) for lag-free gaming & 8K streaming", "2x 2.5 Gbps Ethernet ports + 4x 1 Gbps LAN ports", "Covers up to 3,000 sq ft with mesh expansion support"],
    specs: {
      Wireless: { Standard: "Wi-Fi 7 (802.11be)", Bands: "2.4 GHz, 5 GHz, 6 GHz", Speed: "Up to 9300 Mbps aggregate" },
      Ethernet: { Ports: "2x 2.5 Gbps Multi-Gigabit ports + 4x Gigabit ports" },
      Warranty: { Duration: "2 Years", Coverage: "Replacement Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: {},
    tags: ["router", "wifi7", "networking", "mesh"],
    stock: 45,
    flags: { new: true },
    weight: 780,
  },
  {
    name: "HyperDrive 140W GaN Fast Charger",
    cat: "networking",
    brand: "hyperdrive",
    price: 4499,
    mrp: 5999,
    short: "Multi-port USB-C PD 3.1 GaN charger, charges laptops, tablets & phones simultaneously.",
    description: "Compact gallium nitride (GaN) desktop and travel charger delivering up to 140W single-port Power Delivery 3.1, enough to charge power-hungry laptops and phones at maximum speed.",
    highlights: ["140W max output with USB-C Power Delivery 3.1", "3x USB-C ports + 1x USB-A port with smart power allocation", "Advanced GaN III technology stays cool under full load", "Universal compatibility with laptops, tablets and smartphones"],
    specs: {
      Power: { Input: "100-240V AC 50/60Hz", Output: "140W Max Total", Standards: "PD 3.1, QC 4+, PPS" },
      Ports: { Configuration: "3x USB-C + 1x USB-A" },
      Warranty: { Duration: "1 Year", Coverage: "Manufacturer Warranty" },
      Condition: { Condition: "Brand New" },
    },
    axes: { color: [colors.black, colors.white] },
    tags: ["charger", "gan", "fast-charging", "accessories"],
    stock: 110,
    weight: 290,
  },
];

export const COUPONS = [
  { code: "WELCOME10", description: "10% off your first electronics order (max ₹1,000)", type: "PERCENTAGE" as const, value: 10, minSubtotal: 99900, maxDiscount: 100000, firstOrderOnly: true, isPublic: true },
  { code: "FLAT500", description: "Flat ₹500 off electronics orders above ₹5,000", type: "FIXED_AMOUNT" as const, value: 50000, minSubtotal: 500000, isPublic: true },
  { code: "FREESHIP", description: "Free delivery on any electronics order", type: "FREE_SHIPPING" as const, value: 0, minSubtotal: 0, isStackable: true, isPublic: true },
  { code: "AUDIO20", description: "20% off headphones & audio (max ₹3,000)", type: "PERCENTAGE" as const, value: 20, minSubtotal: 0, maxDiscount: 300000, isStackable: true, category: "audio" },
];

export const SYNONYMS = [
  { term: "phone", synonyms: ["smartphone", "mobile", "cellphone"] },
  { term: "laptop", synonyms: ["notebook", "ultrabook", "macbook", "pc"] },
  { term: "earbuds", synonyms: ["earphones", "tws", "airpods", "buds"] },
  { term: "display", synonyms: ["monitor", "screen", "panel"] },
  { term: "processor", synonyms: ["cpu", "chip", "silicon"] },
];
