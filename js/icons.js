// Line icons for the controls: 24x24, 2px stroke, round caps and joins. The treatments
// (and the kit) are drawn colour art instead, from toolart.js. No emoji anywhere.
import { TOOL_ART } from './toolart.js';

const wrap = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  ...TOOL_ART,
  soundOn: wrap('<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/>'),
  soundOff: wrap('<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'),
  chisel: wrap('<path d="M5 19l3-3"/><path d="M8 16l7.5-7.5 2 2L10 18z"/><path d="M15.5 8.5l2.5-3.5 1 1-3.5 2.5"/>'),
  comb: wrap('<rect x="3" y="6" width="18" height="5" rx="2"/><path d="M6 11v6M9 11v7M12 11v6M15 11v7M18 11v6"/>'),
  pot: wrap('<path d="M5 8h11l-1.2 7.5a3 3 0 0 1-3 2.5H9.2a3 3 0 0 1-3-2.5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-1.6"/><path d="M8 5.5c0-1 1-1 1-2M11.5 5.5c0-1 1-1 1-2"/>'),
  polish: wrap('<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5a4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 10.5a1.5 1.5 0 1 1-1.5 1.5"/>'),
  hand: wrap('<path d="M9.5 13V5.2a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.7 10.6a1.6 1.6 0 0 1 3.2 0v1.2"/><path d="M15.9 11.4a1.5 1.5 0 0 1 3 0v3.4a6.2 6.2 0 0 1-6.2 6.2h-.9a5.6 5.6 0 0 1-4.4-2.1l-2.7-3.4a1.6 1.6 0 0 1 2.4-2l2.4 2.1"/>', 'hand'),
  again: wrap('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V8h-3.5"/>'),
  arrows: wrap('<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>'),
  dropper: wrap('<rect x="9.5" y="2.5" width="5" height="5" rx="2.5"/><path d="M8 9h8"/><path d="M10.5 9v6l1.5 2.5 1.5-2.5V9"/><path d="M12 19.6c-.7.9-1 1.4-1 1.9a1 1 0 0 0 2 0c0-.5-.3-1-1-1.9z"/>'),
  close: wrap('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  order: wrap('<path d="M10.5 6.5h9.5M10.5 12h9.5M10.5 17.5h9.5"/><circle cx="5.5" cy="6.5" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="5.5" cy="17.5" r="1.6"/>'),
  bandage: wrap('<g transform="rotate(-40 12 12)"><rect x="2.5" y="8.2" width="19" height="7.6" rx="3.8"/><rect x="9" y="8.2" width="6" height="7.6"/><path d="M11 11h.01M13 13h.01M13 11h.01M11 13h.01"/></g>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  play: wrap('<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7z"/>'),
  next: wrap('<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  up: wrap('<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/>'),
  star: wrap('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
};

// filled star used as the sweet-zone marker in the progress meter (a game graphic, not an icon)
export const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="#ffc93c" stroke="#3a2747" stroke-width="2" stroke-linejoin="round"/></svg>';
