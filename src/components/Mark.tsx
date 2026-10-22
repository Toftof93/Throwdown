// The Throwdown mark: red corner, blue corner, and the strike between them.
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <clipPath id="td-clip">
        <rect width="32" height="32" rx="9" />
      </clipPath>
      <g clipPath="url(#td-clip)">
        <path d="M0 0h32L0 32Z" fill="#ff3348" />
        <path d="M32 0v32H0Z" fill="#3a7bff" />
      </g>
      <path d="M18.5 4 9.5 18h6l-2.5 10 10-15h-6.2L18.5 4Z" fill="#ffc531" stroke="#0b0a0d" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
