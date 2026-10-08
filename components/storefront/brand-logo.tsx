type BrandLogoProps = {
  inverse?: boolean;
  size?: "sm" | "lg";
};

export default function BrandLogo({ inverse = false, size = "sm" }: BrandLogoProps) {
  const iconSize = size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg";
  const nameSize = size === "lg" ? "text-3xl" : "text-[21px]";
  const colors = inverse
    ? { mark: "border-[#d6ed79]/60 bg-white/5 text-[#d6ed79]", name: "text-white", descriptor: "text-white/65" }
    : { mark: "border-[#758446]/30 bg-[#758446]/5 text-[#65763a]", name: "text-[#20211e]", descriptor: "text-[#6d6e64]" };

  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid shrink-0 place-items-center border ${iconSize} ${colors.mark}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-black tracking-[-0.065em] ${nameSize} ${colors.name}`}>HI-FI</span>
        <span className={`mt-1 text-[9px] font-semibold tracking-[0.16em] ${colors.descriptor}`}>ELECTRONICS</span>
      </span>
    </span>
  );
}
