// The Throwdown mark: a gold strike on black.
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <clipPath id="td-clip">
        <rect width="32" height="32" rx="9" />
      </clipPath>
      <g clipPath="url(#td-clip)">
        <rect width="32" height="32" fill="#000" />
        <rect x=".75" y=".75" width="30.5" height="30.5" rx="8.25" fill="none" stroke="#ffc531" strokeOpacity=".5" strokeWidth="1.5" />
      </g>
      <path d="M18.5 4 9.5 18h6l-2.5 10 10-15h-6.2L18.5 4Z" fill="#ffc531" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
