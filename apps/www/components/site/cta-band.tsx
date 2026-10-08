import Link from "next/link";
export function CtaBand() {
  return (
    <section className="reference-final-cta">
      <h2>Try StudPilot now.</h2>
      <Link href="/app" className="studio-button">
        Open StudPilot ↗
      </Link>
    </section>
  );
}
