import Image from "next/image";

export function BrandLogo() {
  return (
    <span className="attest-lockup">
      <Image
        src="/logos/attest-aligned-symbol.png"
        alt=""
        width={30}
        height={30}
        className="attest-symbol"
      />
      <span className="attest-brand-name">
        attest
        <span className="brand-period" aria-hidden="true">
          .
        </span>
      </span>
    </span>
  );
}
