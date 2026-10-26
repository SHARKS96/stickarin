/**
 * Die Icons der App.
 *
 * ERZEUGT von `scripts/generate-icons.mjs` aus `assets/icons/`.
 * Nicht von Hand ändern — stattdessen die SVG anpassen und neu erzeugen.
 *
 * Alle sind rein dekorativ (`aria-hidden`) und nehmen über
 * `currentColor` die Farbe ihrer Umgebung an. Den Namen für die
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

/** Dateien */
export const Dateien = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

/** Drehen */
export const Drehen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5" />
  </Icon>
);

/** Einstellungen */
export const Einstellungen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />
  </Icon>
);

/** Erhaben (3D) */
export const Erhaben = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5" />
  </Icon>
);

/** Farbe */
export const Farbe = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c3.5 4.5 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11z" />
  </Icon>
);

/** Fertig */
export const Fertig = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
);

/** Fotos */
export const Fotos = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M6.7 10a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M21 16l-5-5-8 8" />
  </Icon>
);

/** Früher */
export const Frueher = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5 M6 11l6-6 6 6" />
  </Icon>
);

/** Füllstich */
export const Fuellstich = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M4.5 10.5l6-6 M4.5 16.5l12-12 M7.5 19.5l12-12 M13.5 19.5l6-6" />
  </Icon>
);

/** Garn */
export const Garn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h14 M5 20h14 M7 4v16 M17 4v16 M7 8l10 3 M7 12l10 3 M7 16l10 3" />
  </Icon>
);

/** Geradstich */
export const Geradstich = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 17c4-8 8 4 12-4s4-6 6-6" />
  </Icon>
);

/** Größe */
export const Groesse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6 M10 20H4v-6 M20 4l-6.5 6.5 M4 20l6.5-6.5" />
  </Icon>
);

/** Hilfe */
export const Hilfe = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0-19 0 M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2.2-2.3 3.5 M12 17.3v.01" />
  </Icon>
);

/** Hinzufügen */
export const Hinzufuegen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14 M5 12h14" />
  </Icon>
);

/** Kamera */
export const Kamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0" />
  </Icon>
);

/** Löschen */
export const Loeschen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12 M9 7V4h6v3" />
  </Icon>
);

/** Nadel */
export const Nadel = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20l9.5-9.5 M13.5 10.5l3.8-3.8a1.6 1.6 0 0 0-2.3-2.3l-3.8 3.8z M19 7c2 4-2 9-7 12" />
  </Icon>
);

/** Pipette */
export const Pipette = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 6l5 5 M15.5 3.5a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L18 11 13 6z M14.5 9.5L6 18H4v-2l8.5-8.5" />
  </Icon>
);

/** Satinstich */
export const Satinstich = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5l10 2.5 M7 9l10 2.5 M7 13.5l10 2.5 M7 18l10 2.5" />
  </Icon>
);

/** Schließen */
export const Schliessen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12 M18 6L6 18" />
  </Icon>
);

/** Später */
export const Spaeter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14 M6 13l6 6 6-6" />
  </Icon>
);

/** Speichern */
export const Speichern = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11 M7 10l5 5 5-5 M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </Icon>
);

/** Startseite */
export const Startseite = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5" />
  </Icon>
);

/** Stickmaschine */
export const Stickmaschine = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 20h18 M5 20V8a3 3 0 0 1 3-3h10a2 2 0 0 1 2 2v4h-6v3 M14 14v3" />
  </Icon>
);

/** Stickrahmen */
export const Stickrahmen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h8a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-5a5 5 0 0 1 5-5z M8.5 9.5h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z M10 6V3h4v3" />
  </Icon>
);

/** Tipp */
export const Tipp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
  </Icon>
);

/** USB-Stick */
export const UsbStick = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 9h5a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 18.5v-7A2.5 2.5 0 0 1 9.5 9z M9 9V3h6v6 M11 5.5h.01 M13 5.5h.01" />
  </Icon>
);

/** Weiter */
export const Weiter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

/** Weniger */
export const Weniger = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

/** Zurück */
export const Zurueck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
