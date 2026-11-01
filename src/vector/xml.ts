/**
 * Ein kleiner XML-Leser — gerade so viel, wie ein SVG braucht.
 *
 * Warum nicht `DOMParser`? Die Rechnerei läuft im Worker, und dort gibt es
 * kein DOM: Safari stellt `DOMParser` in Workern nicht bereit. Außerdem
 * soll alles unter `core/`, `image/` und `vector/` ohne Browser testbar
 * bleiben. Hundert Zeilen Scanner sind billiger als eine Ausnahme von
 * dieser Regel.
 *
 * Was fehlt, fehlt mit Absicht: Verarbeitungsanweisungen, DTD-Entitäten und
 * Namensräume werden überlesen statt ausgewertet. Für Dateien aus
 * Illustrator, Inkscape, Affinity, Figma oder Canva reicht das.
 */

export interface XmlElement {
  /** Elementname ohne Namensraum-Präfix, klein geschrieben: `path`, `g`, `lineargradient`. */
  name: string;
  /** Attribute ohne Präfix, klein geschrieben; `xlink:href` wird zu `href`. */
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Zusammengefasster Textinhalt — gebraucht wird er nur für `<style>`. */
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** `&amp;` und `&#x2d;` auflösen; Unbekanntes bleibt stehen. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Namensraum abschneiden: aus `svg:path` wird `path`, aus `xlink:href` wird `href`. */
function stripNamespace(name: string): string {
  const colon = name.indexOf(':');
  return (colon < 0 ? name : name.slice(colon + 1)).toLowerCase();
}

/**
 * Liest ein Dokument und gibt das Wurzelelement zurück.
 *
 * `null` heißt: kein einziges Element gefunden. Ein unvollständiger Baum
 * — etwa ein fehlendes schließendes Tag — wird so weit genommen, wie er
 * trägt; eine kaputte Datei soll nichts zum Absturz bringen, sondern am
 * Ende einfach keine Flächen liefern.
 */
export function parseXml(source: string): XmlElement | null {
  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];
  let i = 0;

  const addText = (text: string) => {
    const top = stack[stack.length - 1];
    if (top && text.trim().length > 0) top.text += decodeEntities(text);
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      addText(source.slice(i));
      break;
    }
    if (lt > i) addText(source.slice(i, lt));

    // Kommentar, CDATA, Deklaration: überlesen, CDATA aber als Text behalten.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      const stop = end < 0 ? source.length : end;
      const top = stack[stack.length - 1];
      if (top) top.text += source.slice(lt + 9, stop);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('<!', lt)) {
      // DOCTYPE: kann innere eckige Klammern haben, die ein `>` enthalten.
      const bracket = source.indexOf('[', lt);
      const firstGt = source.indexOf('>', lt);
      if (bracket >= 0 && firstGt >= 0 && bracket < firstGt) {
        const close = source.indexOf(']>', bracket);
        i = close < 0 ? source.length : close + 2;
      } else {
        i = firstGt < 0 ? source.length : firstGt + 1;
      }
      continue;
    }

    const gt = findTagEnd(source, lt + 1);
    if (gt < 0) break;
    const inner = source.slice(lt + 1, gt);

    // Schließendes Tag.
    if (inner.startsWith('/')) {
      const name = stripNamespace(inner.slice(1).trim());
      // Zum passenden Element zurückklettern; sonst war das Tag unerwartet.
      for (let d = stack.length - 1; d >= 0; d--) {
        if ((stack[d] as XmlElement).name === name) {
          stack.length = d;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const element = parseTag(body);
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else if (!root) root = element;
    if (!selfClosing) stack.push(element);
    i = gt + 1;
  }

  return root;
}

/**
 * Das `>`, das das Tag beendet — Anführungszeichen überspringend.
 *
 * `<path d="M0,0 L5,5" clip-path="url(#a)">` ist harmlos, aber ein `>` in
 * einem Attributwert (etwa in `style="font: >"`) käme sonst zu früh.
 */
function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i] as string;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

const ATTR = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseTag(body: string): XmlElement {
  const match = /^\s*([^\s/>]+)/.exec(body);
  const name = stripNamespace(match ? (match[1] as string) : '');
  const attrs: Record<string, string> = {};

  ATTR.lastIndex = match ? match[0].length : 0;
  for (;;) {
    const attr = ATTR.exec(body);
    if (!attr) break;
    const value = attr[3] ?? attr[4] ?? attr[5] ?? '';
    attrs[stripNamespace(attr[1] as string)] = decodeEntities(value);
  }

  return { name, attrs, children: [], text: '' };
}

/** Alle Elemente des Baums in Dokumentreihenfolge, die Wurzel zuerst. */
export function walkXml(element: XmlElement): XmlElement[] {
  const out: XmlElement[] = [element];
  for (const child of element.children) out.push(...walkXml(child));
  return out;
}
