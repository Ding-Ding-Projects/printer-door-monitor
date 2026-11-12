// The door chimes, the same library as the Door chime card in Bambu Studio MD3. Notes are
// MIDI-style pitches (69 = A4 = 440 Hz, 0 = rest) with a length in buzzer ticks.

export const SILENT = 'silent';

export const OPEN_CHIMES = [
  { id: 'ding_dong', name: 'Ding-dong', yue: '叮噹', notes: [[76, 25], [72, 35]] },
  { id: 'welcome_rise', name: 'Welcome rise', yue: '歡迎上揚', notes: [[72, 8], [76, 8], [79, 8], [84, 20]] },
  { id: 'shop_bell', name: 'Shop bell', yue: '店舖門鈴', notes: [[88, 6], [0, 4], [88, 14]] },
  { id: 'westminster_open', name: 'Westminster, first phrase', yue: '西敏寺鐘聲第一句', notes: [[76, 15], [72, 15], [74, 15], [67, 30]] },
  { id: 'hello_chirp', name: 'Hello chirp', yue: '哈囉啾啾', notes: [[79, 6], [84, 12]] },
  { id: 'marimba_up', name: 'Marimba up', yue: '木琴上行', notes: [[72, 6], [74, 6], [76, 6], [79, 6], [81, 16]] },
  { id: 'single_ping', name: 'Single ping', yue: '一聲叮', notes: [[84, 12]] },
  { id: SILENT, name: 'Silent', yue: '靜音', notes: [] },
];

export const CLOSE_CHIMES = [
  { id: 'dong_ding', name: 'Dong-ding', yue: '噹叮', notes: [[72, 20], [76, 30]] },
  { id: 'falling_arpeggio', name: 'Falling arpeggio', yue: '下行琶音', notes: [[84, 8], [79, 8], [76, 8], [72, 20]] },
  { id: 'westminster_close', name: 'Westminster, closing phrase', yue: '西敏寺鐘聲收尾句', notes: [[67, 15], [74, 15], [76, 15], [72, 30]] },
  { id: 'goodnight', name: 'Goodnight', yue: '早唞', notes: [[76, 14], [74, 14], [72, 28]] },
  { id: 'soft_latch', name: 'Soft latch', yue: '輕輕扣門', notes: [[60, 6], [0, 3], [55, 10]] },
  { id: 'double_tap', name: 'Double tap', yue: '敲兩下', notes: [[72, 5], [0, 4], [72, 5]] },
  { id: 'bye_chirp', name: 'Bye chirp', yue: '拜拜啾啾', notes: [[84, 6], [79, 12]] },
  { id: SILENT, name: 'Silent', yue: '靜音', notes: [] },
];

export function findChime(list, id) {
  return list.find((chime) => chime.id === id) || list[0];
}

// The live commands for a chime, as Bambu Studio sends them: motors on, queue drained,
// every note on all three buzzer voices, motors released. Empty for Silent.
export function chimeGcode(chime) {
  if (!chime || chime.notes.length === 0) return '';
  let out = 'M17\nM400 S1\nM1006 S1\n';
  for (const [pitch, ticks] of chime.notes) {
    const volume = pitch > 0 ? 100 : 0;
    out += `M1006 A${pitch} B${ticks} L${volume} C${pitch} D${ticks} M${volume} E${pitch} F${ticks} N${volume}\n`;
  }
  return out + 'M1006 W\nM18\n';
}
