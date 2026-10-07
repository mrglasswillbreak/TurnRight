/** The offline map tile, with a right-facing navigation arrow. Keep the asset generator in sync. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 42"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="42" height="42" rx="9" fill="#202a36" />
      <path
        d="M0 14h42M0 29h42M13 0v42M30 0v42"
        stroke="#43535e"
        strokeWidth="5"
      />
      <rect
        x=".5"
        y=".5"
        width="41"
        height="41"
        rx="8.5"
        stroke="#627582"
        strokeOpacity=".5"
      />
      <path
        d="M13 37V18q0-4 4-4h13"
        stroke="#72baff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="m37 14-12-6 3 6-3 6Z"
        fill="#a4d5ff"
        stroke="#202a36"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
