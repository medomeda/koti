/**
 * Illustration du hero : huit membres en cercle, la cagnotte (jeton d'or) avance jusqu'au tour 3.
 * Entièrement en SVG/CSS (voir globals.css) : aucune dépendance, animation unique, désactivée si
 * l'utilisateur préfère moins de mouvement.
 */
const SEATS = [
  { initials: "AT", name: "Ahmed" },
  { initials: "AD", name: "Awa" },
  { initials: "KN", name: "Koffi" },
  { initials: "MK", name: "Mariam" },
  { initials: "IO", name: "Ibrahim" },
  { initials: "FB", name: "Fatou" },
  { initials: "SC", name: "Seydou" },
  { initials: "AS", name: "Aminata" },
];
const CX = 180;
const CY = 180;
const R = 126;

const at = (i: number) => {
  const a = (i * 45 * Math.PI) / 180;
  return { x: CX + R * Math.sin(a), y: CY - R * Math.cos(a) };
};

export function RotationCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 360" className={className} role="img" aria-label="Cercle de huit membres : le tour 3 revient à Koffi, qui reçoit la cagnotte de 80 000 FCFA.">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#bbf7d0" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
      {SEATS.map((s, i) => {
        const { x, y } = at(i);
        const third = i === 2;
        return (
          <g key={s.name}>
            <circle cx={x} cy={y} r="25" className={third ? "koti-seat-3" : undefined} fill="#16382a" stroke="#bbf7d0" strokeOpacity={third ? 1 : 0.55} strokeWidth="1.5" />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e8f7ee" className={third ? "koti-seat-3-text" : undefined}>
              {s.initials}
            </text>
            <text x={x} y={y + (y > CY ? 44 : -34)} textAnchor="middle" fontSize="11" fill="#bbf7d0" fillOpacity="0.8">
              {i + 1}. {s.name}
            </text>
          </g>
        );
      })}
      <g className="koti-token">
        <circle cx={CX} cy={CY - R} r="9" fill="#f4c04e" stroke="#0f2a1c" strokeWidth="2.5" />
      </g>
      <text x={CX} y={CY - 6} textAnchor="middle" fontSize="30" fontWeight="700" fill="#f4c04e" style={{ fontFamily: "var(--font-display), sans-serif" }}>
        80 000
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" fontSize="12" fill="#bbf7d0">
        FCFA à chaque tour
      </text>
    </svg>
  );
}
