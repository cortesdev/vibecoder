import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";

const logoFont = Space_Grotesk({ subsets: ["latin"], weight: "700" });

export default function Wordmark({
  href = "/",
  label = "Go to homepage",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link href={href} aria-label={label} className="flex items-center gap-2">
      <Image
        src="/vibe-logo.png"
        alt=""
        width={20}
        height={20}
        className="rounded-[5px]"
        priority
      />
      <span className={`${logoFont.className} text-[17px] font-bold tracking-[-0.02em]`}>
        vibecoder
      </span>
    </Link>
  );
}