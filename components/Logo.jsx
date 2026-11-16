// The one Test Dashboard logo: stacked test layers on a cream tile. Same artwork as the favicon (app/icon.svg) and the report header.
export default function Logo({ size = 50 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Test Dashboard">
      <rect width="64" height="64" rx="18" fill="#f4f0d6" />
      <path d="M32 15 50 25 32 35 14 25z" fill="#202020" />
      <path d="M14 33l18 10 18-10" fill="none" stroke="#202020" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 41l18 10 18-10" fill="none" stroke="#202020" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
    </svg>
  );
}
