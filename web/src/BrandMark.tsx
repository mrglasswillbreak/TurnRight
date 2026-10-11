/** B2 campus mark: a right-turn route and academic cap. Keep the asset generator in sync. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" rx="22" fill="#202A36" />
      <path
        d="M31.5 77V48A14 14 0 0 1 45.5 34H68"
        stroke="#72BAFF"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M84 34L60 20L66.5 34L60 48Z"
        fill="#A4D5FF"
        stroke="#A4D5FF"
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      <g fill="#A4D5FF">
        <path d="M49.5 62L64.5 55L79.5 62L64.5 69Z" />
        <path d="M54.5 68.5L64.5 73.2L74.5 68.5V74.5Q64.5 80.5 54.5 74.5Z" />
        <path
          d="M78.8 65V75"
          fill="none"
          stroke="#A4D5FF"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
