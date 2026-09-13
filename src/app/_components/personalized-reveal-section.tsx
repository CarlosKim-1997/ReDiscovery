import type { RevealView } from "./session-types";

export function PersonalizedRevealSection({ reveal }: { readonly reveal: RevealView }) {
  if (!reveal.personalizedConnection) return null;
  return <section className="connection-card" aria-label="당신의 생각과 원래 통찰">
    {reveal.revealOutcome ? <div>
      <h2>{reveal.revealOutcome.label}</h2>
      <p>{reveal.revealOutcome.explanation}</p>
    </div> : null}
    {reveal.personalizedConnection.items.length > 0 ? <div>
      <h2>당신이 짚은 부분</h2>
      {reveal.personalizedConnection.items.map(item => <article key={item.label}>
        <h3>{item.label}</h3>
        <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.userExcerpt}</blockquote>
        <p>{item.explanation}</p>
      </article>)}
    </div> : null}
    <h2>원래 통찰</h2>
    <p>{reveal.personalizedConnection.canonicalInsight}</p>
  </section>;
}
