import Image from "next/image";
import { cn } from "@/lib/utils";

/** Shared raster brand artwork for the fictional vendors. */
export function VendorLogo({
  vendor,
  large = false,
}: {
  vendor: string;
  large?: boolean;
}) {
  const name = vendor.toLowerCase();
  const brand = name.includes("harbor court")
    ? "harbor"
    : name.includes("summit")
      ? "summit"
      : name.includes("pacific")
        ? "pacific"
        : name.includes("meridian")
          ? "meridian"
          : null;
  if (!brand) return <span className="vendor-wordmark-fallback">{vendor}</span>;
  return (
    <Image
      className={cn("vendor-logo", large && "vendor-logo--large")}
      src={`/logos/${brand}-wordmark.png`}
      alt={`${vendor} logo`}
      width={large ? 146 : 112}
      height={large ? 50 : 38}
    />
  );
}
