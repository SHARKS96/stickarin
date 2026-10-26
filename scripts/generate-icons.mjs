/**
 * Erzeugt `src/ui/Icons.tsx` aus den SVG-Dateien in `assets/icons/`.
 *
 * Warum generieren statt die Dateien zur Laufzeit zu laden: So steckt
 * jedes Icon als Pfad im Bundle, braucht keine Anfrage ans Netz und erbt
 * über `currentColor` die Farbe seines Knopfes.
 *
 * Aus den Quelldateien wird ausschließlich das `d`-Attribut der Pfade und
 * der Titel übernommen — Skripte, Verweise oder eingebettete Bilder in
 * einer SVG können damit gar nicht erst im Bundle landen.
 *
 * Aufruf: node scripts/generate-icons.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'assets/icons';
const TARGET = 'src/ui/Icons.tsx';

/** drehen -> Drehen, usb-stick -> UsbStick */
function componentName(fileName) {
  return fileName
    .replace(/\.svg$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const files = readdirSync(SOURCE)
  .filter((f) => f.endsWith('.svg'))
  .sort();

const icons = files.map((file) => {
  const svg = readFileSync(join(SOURCE, file), 'utf8');

  const title = svg.match(/<title>([^<]*)<\/title>/)?.[1] ?? componentName(file);
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`${file}: kein Pfad gefunden`);

  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (viewBox !== '0 0 24 24') throw new Error(`${file}: unerwartete viewBox ${viewBox}`);

  return { name: componentName(file), title, paths };
});

const body = icons
  .map(
    ({ name, title, paths }) => `
/** ${title} */
export const ${name} = (p: IconProps) => (
  <Icon {...p}>
${paths.map((d) => `    <path d="${d}" />`).join('\n')}
  </Icon>
);`,
  )
  .join('\n');

const out = `/**
 * Die Icons der App.
 *
 * ERZEUGT von \`scripts/generate-icons.mjs\` aus \`assets/icons/\`.
 * Nicht von Hand ändern — stattdessen die SVG anpassen und neu erzeugen.
 *
 * Alle sind rein dekorativ (\`aria-hidden\`) und nehmen über
 * \`currentColor\` die Farbe ihrer Umgebung an. Den Namen für die
 * Vorlesesoftware trägt der Knopf, nicht das Icon.
 */

export interface IconProps {
  /** Kantenlänge in Pixeln. */
  size?: number;
  /** Strichstärke; die Vorlage zeichnet mit 2,4. */
  strokeWidth?: number;
}

function Icon({
  size = 28,
  strokeWidth = 2.4,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
${body}
`;

writeFileSync(TARGET, out);
console.log(`${icons.length} Icons nach ${TARGET} geschrieben.`);
