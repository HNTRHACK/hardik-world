/** 24px line icons (stroke = currentColor), one per stall. Decorative: aria-hidden. */
const wrap = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

export const ICONS: Record<string, string> = {
  // cup + steam
  chaipay: wrap('<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3c-1 1.2 1 1.8 0 3M12.5 3c-1 1.2 1 1.8 0 3"/>'),
  // parcel
  omen: wrap('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/><path d="m7.8 5.2 8.5 4.6"/>'),
  // cross
  'federated-clinical': wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  // notice board
  umang: wrap('<rect x="3.5" y="4.5" width="17" height="12" rx="1"/><path d="M8 20l1.5-3.5M16 20l-1.5-3.5"/><path d="M7 8.5h4M7 11.5h6M15 8.5h2"/>'),
  // traffic light
  orion: wrap('<rect x="8" y="2.5" width="8" height="15" rx="2"/><circle cx="12" cy="6.5" r="1.4"/><circle cx="12" cy="10" r="1.4"/><circle cx="12" cy="13.5" r="1.4"/><path d="M12 17.5V22"/>'),
  // line chart
  'cobra-kai': wrap('<path d="M3.5 20.5h17"/><path d="m4.5 16 4.5-5 3.5 3 6.5-8"/><path d="M15.5 6h3.5v3.5"/>'),
};

export const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
export const ARROW_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 17 17 7M9 7h8v8"/></svg>`;
