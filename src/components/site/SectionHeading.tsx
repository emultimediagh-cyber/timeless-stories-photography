export function SectionHeading({ eyebrow, title, center }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      <p className="text-xs uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
      <h2 className="mt-4 text-4xl md:text-6xl">{title}</h2>
    </div>
  );
}

export const btnPrimary =
  "inline-flex items-center justify-center bg-primary px-8 py-4 text-xs uppercase tracking-[0.25em] text-primary-foreground transition hover:bg-accent";
export const btnOutline =
  "inline-flex items-center justify-center border border-current px-8 py-4 text-xs uppercase tracking-[0.25em] transition hover:bg-accent hover:border-accent hover:text-accent-foreground";
