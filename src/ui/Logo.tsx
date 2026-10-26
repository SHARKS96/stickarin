/**
 * Marke: ein „K“ im Geradstich, mit Nadel und Faden am oberen Ende.
 *
 * Übernommen aus `assets/stickarin-logo.svg` und
 * `assets/stickarin-logo-schriftzug.svg`. Inline statt als Bilddatei,
 * damit der Schriftzug die Textfarbe der Umgebung erbt und auf dem
 * Startbildschirm nichts nachgeladen werden muss.
 */

const STITCH = '#0060DF';
const NEEDLE = '#8E97A6';

/** Nur das Zeichen, ohne Schrift. `holeColor` ist das Öhr der Nadel. */
export function LogoMark({
  size = 64,
  holeColor = '#FFFFFF',
}: {
  size?: number;
  holeColor?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="220 190 600 680" aria-hidden="true">
      <g transform="translate(-74 52)">
        <g
          transform="translate(-40 10)"
          fill="none"
          stroke={STITCH}
          strokeWidth="62"
          strokeDasharray="36 104"
          strokeLinecap="round"
        >
          <path d="M380 236V788" />
          <path d="M736 242L446 532" />
          <path d="M540 536L764 786" />
        </g>
        <path
          d="M696 252C750 196 790 236 834 202"
          fill="none"
          stroke={STITCH}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <g transform="translate(856 176) rotate(40)">
          <path d="M-12 0h24v190l-12 46-12-46z" fill={NEEDLE} />
          <rect x="-5" y="12" width="10" height="44" rx="5" fill={holeColor} />
        </g>
      </g>
    </svg>
  );
}

/** Zeichen plus Schriftzug; die Schrift nimmt die Textfarbe der Umgebung. */
export function Wordmark({ height = 56 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 720 200"
      role="img"
      aria-label="Stickarin"
      style={{ display: 'block' }}
    >
      <g transform="translate(8 10) scale(0.2633 0.2647) translate(-220 -190)">
        <g transform="translate(-74 52)">
          <g
            transform="translate(-40 10)"
            fill="none"
            stroke={STITCH}
            strokeWidth="62"
            strokeDasharray="36 104"
            strokeLinecap="round"
          >
            <path d="M380 236V788" />
            <path d="M736 242L446 532" />
            <path d="M540 536L764 786" />
          </g>
          <path
            d="M696 252C750 196 790 236 834 202"
            fill="none"
            stroke={STITCH}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <g transform="translate(856 176) rotate(40)">
            <path d="M-12 0h24v190l-12 46-12-46z" fill={NEEDLE} />
            <rect x="-5" y="12" width="10" height="44" rx="5" fill="#FFFFFF" />
          </g>
        </g>
      </g>
      <text
        x="196"
        y="132"
        fontFamily="inherit"
        fontSize="96"
        fontWeight="700"
        letterSpacing="-1.5"
        fill="currentColor"
      >
        Stickarin
      </text>
    </svg>
  );
}
