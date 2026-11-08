// Line icons: 24x24, 2px stroke, round caps and joins. No emoji anywhere.
const wrap = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  soundOn: wrap('<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/>'),
  soundOff: wrap('<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'),
  sponge: wrap('<rect x="4" y="9" width="16" height="10" rx="3"/><path d="M4 12.5h16"/><circle cx="8.5" cy="16" r="0.8"/><circle cx="13" cy="15.5" r="0.8"/><circle cx="16.5" cy="16.5" r="0.6"/><path d="M8 6.5a1.5 1.5 0 1 1 3 0M14 4.8a1.2 1.2 0 1 1 2.4 0"/>'),
  pop: wrap('<circle cx="12" cy="13" r="3.5"/><path d="M12 5V3.5M17.7 7.3l1.1-1.1M20 13h1.5M6.3 7.3 5.2 6.2M4 13H2.5M8 19.5l-1 1M16 19.5l1 1"/>'),
  chisel: wrap('<path d="M5 19l3-3"/><path d="M8 16l7.5-7.5 2 2L10 18z"/><path d="M15.5 8.5l2.5-3.5 1 1-3.5 2.5"/>'),
  mew: wrap('<path d="M7 5c3 0 6 2 6 6l1.5 3-1.5.6V17c0 1.6-1.4 2.5-3 2.5H8"/><path d="M18.5 9v8"/><path d="M16 11.5l2.5-2.5 2.5 2.5"/>'),
  comb: wrap('<rect x="3" y="6" width="18" height="5" rx="2"/><path d="M6 11v6M9 11v7M12 11v6M15 11v7M18 11v6"/>'),
  pot: wrap('<path d="M5 8h11l-1.2 7.5a3 3 0 0 1-3 2.5H9.2a3 3 0 0 1-3-2.5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-1.6"/><path d="M8 5.5c0-1 1-1 1-2M11.5 5.5c0-1 1-1 1-2"/>'),
  polish: wrap('<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5a4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 10.5a1.5 1.5 0 1 1-1.5 1.5"/>'),
  hand: wrap('<path d="M9.5 13V5.2a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.7 10.6a1.6 1.6 0 0 1 3.2 0v1.2"/><path d="M15.9 11.4a1.5 1.5 0 0 1 3 0v3.4a6.2 6.2 0 0 1-6.2 6.2h-.9a5.6 5.6 0 0 1-4.4-2.1l-2.7-3.4a1.6 1.6 0 0 1 2.4-2l2.4 2.1"/>', 'hand'),
  again: wrap('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V8h-3.5"/>'),
  arrows: wrap('<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>'),
  roller: wrap('<rect x="6" y="3" width="13" height="5" rx="2.5"/><path d="M6 5.5H4v6h8.5v9"/>'),
  dropper: wrap('<rect x="9.5" y="2.5" width="5" height="5" rx="2.5"/><path d="M8 9h8"/><path d="M10.5 9v6l1.5 2.5 1.5-2.5V9"/><path d="M12 19.6c-.7.9-1 1.4-1 1.9a1 1 0 0 0 2 0c0-.5-.3-1-1-1.9z"/>'),
  brush: wrap('<path d="M20.5 3.5l-7 7"/><path d="M15.2 12.2l-3.4-3.4"/><path d="M11.8 8.8C8.6 9.3 6.6 11.8 6.1 15c-.3 2-1.1 3.4-2.6 4.5 4 .7 8-.9 9.8-3.7.9-1.4 1.5-2.6 1.9-3.6"/>'),
  tube: wrap('<path d="M6.5 3.5h11"/><path d="M7.5 3.5 9 15.5h6l1.5-12"/><rect x="10" y="15.5" width="4" height="3.5" rx="1"/><path d="M9 7.5h6"/>'),
  glow: wrap('<path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/><path d="M12 8l1.3 2.7L16 12l-2.7 1.3L12 16l-1.3-2.7L8 12l2.7-1.3z"/>'),
  next: wrap('<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  up: wrap('<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/>'),
  star: wrap('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
};

// filled star used as the sweet-zone marker in the progress meter (a game graphic, not an icon)
export const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="#ffc93c" stroke="#3a2747" stroke-width="2" stroke-linejoin="round"/></svg>';
