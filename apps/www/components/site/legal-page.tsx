export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="site-container pt-16 pb-24 sm:pt-24">
      <header className="mx-auto max-w-[720px] border-b pb-10">
        <p className="font-mono text-[12.5px] text-muted-foreground">Updated {updated}</p>
        <h1 className="mt-4 font-semibold text-[40px] leading-[1.05] tracking-[-0.04em] sm:text-[52px]">{title}</h1>
      </header>
      <article className="prose-site mx-auto mt-10 max-w-[720px]">{children}</article>
    </div>
  );
}
