interface Props {
  warnings: string[];
}

/**
 * Renders computeChart warnings prominently. Warnings that mention a paid data
 * provider are styled distinctly so unavailable presets explain themselves
 * instead of looking broken.
 */
export function Warnings({ warnings }: Props) {
  if (warnings.length === 0) return null;
  return (
    <div className="warnings">
      {warnings.map((w, i) => {
        const paid = /paid|opta|sportradar|provider|unavailable/i.test(w);
        return (
          <div key={i} className={`warning ${paid ? "warning--paid" : "warning--info"}`}>
            <span className="warning__icon">{paid ? "🔒" : "ⓘ"}</span>
            <span>{w}</span>
          </div>
        );
      })}
    </div>
  );
}
