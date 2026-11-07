/**
 * Histogramme mensuel en SVG pur (rendu serveur, aucune bibliothèque). Accessible : description textuelle,
 * valeurs en infobulle (<title>) et tableau équivalent masqué visuellement.
 */
const monthLabel = (key: string, withYear: boolean) => {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 1));
  const label = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return withYear ? `${label} ${String(y).slice(2)}` : label;
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function BarChart({ title, months, values, format = (n) => String(n), unit }: { title: string; months: string[]; values: number[]; format?: (n: number) => string; unit: string }) {
  const W = 640;
  const H = 230;
  const pad = { l: 8, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(...values));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = innerW / values.length;
  const barW = Math.min(34, step * 0.62);
  const total = values.reduce((a, b) => a + b, 0);
  const lines = [0.25, 0.5, 0.75, 1];
  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">12 mois : {format(total)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title} sur 12 mois, ${unit}. Total : ${format(total)}. Dernier mois : ${format(values[values.length - 1]!)}.`}>
        {lines.map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="var(--border)" strokeDasharray={g === 1 ? "0" : "3 4"} />
            <text x={W - pad.r} y={pad.t + innerH * (1 - g) - 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
              {format(Math.round(max * g))}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="var(--input)" />
        {values.map((v, i) => {
          const h = (v / max) * innerH;
          const x = pad.l + step * i + (step - barW) / 2;
          const last = i === values.length - 1;
          return (
            <g key={months[i]}>
              <rect x={x} y={pad.t + innerH - h} width={barW} height={Math.max(h, v > 0 ? 2 : 0)} rx="3" fill={last ? "var(--primary)" : "var(--primary)"} fillOpacity={last ? 1 : 0.45}>
                <title>{`${monthLabel(months[i]!, true)} : ${format(v)} ${unit}`}</title>
              </rect>
              <text x={x + barW / 2} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                {monthLabel(months[i]!, i === 0 || months[i]!.endsWith("-01"))}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Mois</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            <tr key={months[i]}>
              <td>{monthLabel(months[i]!, true)}</td>
              <td>{format(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Funnel({ steps }: { steps: Array<{ label: string; count: number }> }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const pct = Math.round((s.count / top) * 100);
        const prev = i > 0 ? steps[i - 1]!.count : null;
        const drop = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums">
                <strong>{s.count}</strong>
                <span className="ml-1.5 text-xs text-muted-foreground">{i === 0 ? "" : `${pct} % des inscrits${drop !== null ? ` · ${drop} % de l'étape précédente` : ""}`}</span>
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${s.label} : ${s.count}, soit ${pct} % des inscrits`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%`, opacity: 1 - i * 0.18 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
