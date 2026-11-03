import "./marketing.css";

/** A headline whose words rise one after the other. The text stays one readable sentence. */
export function HeroTitle({ text, className }: { readonly text: string; readonly className?: string }) {
  return (
    <h1 aria-label={text} className={`hero-title ${className ?? ""}`}>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden>
          <span className="hero-word">
            <span style={{ "--w": i } as React.CSSProperties}>{word}</span>
          </span>{" "}
        </span>
      ))}
    </h1>
  );
}
