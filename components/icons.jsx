// Small stroke icons (24px grid), in the thin outline style of the reference design.
const P = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" opacity=".9" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  cube: <><path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z" /><path d="M4 7.6 12 12l8-4.4M12 12v8.8" /></>,
  chart: <><rect x="4" y="12.5" width="3.4" height="7" rx="1" /><rect x="10.3" y="4.5" width="3.4" height="15" rx="1" /><rect x="16.6" y="9.5" width="3.4" height="10" rx="1" /></>,
  user: <><circle cx="12" cy="8.2" r="3.6" /><path d="M4.6 20c.6-3.6 3.5-5.6 7.4-5.6s6.8 2 7.4 5.6" /></>,
  clock: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4V12l3.2 2" /></>,
  report: <><path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" /><path d="M14 3.5V8h4M9 13h6M9 16.5h6" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" /></>,
  moon: <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8z" />,
  gear: <><circle cx="12" cy="12" r="3.1" /><path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.6 15.6 4.4 4.4" /></>,
  bell: <><path d="M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.5 1.6H4.7z" /><path d="M10 20.4a2.2 2.2 0 0 0 4 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.8 4.4 4.4L19 7.6" />,
  play: <path d="M8 5.6v12.8L18.6 12z" fill="currentColor" />,
  logo: <><path d="M5 9.4 12 5l7 4.4-7 4.4z" fill="currentColor" /><path d="m5 13.4 7 4.4 7-4.4" /><path d="m5 17 7 4.4" opacity=".0" /></>,
};
export default function Icon({ name, size = 22, stroke = 1.6, style }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>{P[name]}</svg>;
}
