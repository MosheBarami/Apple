import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { Reveal } from "./reveal";
export function CtaBand() {
  return (
    <section className="cta-section site-container">
      <div className="cta-scene luminous-panel">
        <Image
          src="/art/creation-world.webp"
          width={1600}
          height={900}
          alt=""
          className="cta-art"
          sizes="(max-width: 640px) 100vw, 1280px"
        />
        <div className="cta-overlay" />
        <Reveal className="cta-copy">
          <p className="studio-eyebrow">
            <span />
            YOUR NEXT IDEA IS WAITING
          </p>
          <h2>
            What if you
            <br />
            <span className="gradient-text">just started?</span>
          </h2>
          <p>
            Open the conversation.
            <br />
            Bring something only you could imagine.
          </p>
          <Link href="/login" className="studio-button">
            <span>Let’s build something</span>
            <ArrowUpRightIcon className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
