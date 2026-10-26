/** Strichzeichnungen im Stil des Entwurfs. Alle rein dekorativ. */

interface Props {
  size?: number;
  strokeWidth?: number;
}

function Svg({ size = 28, strokeWidth = 2.2, children }: Props & { children: React.ReactNode }) {
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

export const ChevronLeft = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ChevronRight = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const Check = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 3}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const Plus = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.8}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Minus = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.8}>
    <path d="M5 12h14" />
  </Svg>
);

export const Question = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2.2-2.3 3.5" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
  </Svg>
);

export const Photo = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="8.5" cy="10" r="1.8" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
);

export const Folder = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const Camera = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const Pipette = (p: Props) => (
  <Svg {...p}>
    <path d="M13 6l5 5" />
    <path d="M15.5 3.5a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L18 11 13 6z" />
    <path d="M14.5 9.5L6 18H4v-2l8.5-8.5" />
  </Svg>
);

export const Rotate = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </Svg>
);

export const Sliders = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);

export const UsbStick = (p: Props) => (
  <Svg {...p}>
    <path d="M9 2.5h6v5H9z" />
    <path d="M7 7.5h10v8.5a5 5 0 0 1-10 0z" />
  </Svg>
);

export const Bulb = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
  </Svg>
);

export const Trash = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);

export const Needle = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
