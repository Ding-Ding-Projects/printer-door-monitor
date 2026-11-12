// English and Hong Kong Cantonese strings. Bilingual mode shows "English · 廣東話".
export const STRINGS = {
  appName: ['Printer Door Monitor', '打印機門監察'],
  signIn: ['Sign in', '登入'],
  signOut: ['Sign out', '登出'],
  password: ['Password', '密碼'],
  wrongPassword: ['That password is not right.', '密碼唔啱。'],
  passwordLength: ['Use at least 8 characters.', '最少要 8 個字元。'],
  setupTitle: ['Set up the door monitor', '設定門監察'],
  stepPassword: ['Password', '密碼'],
  stepPrinter: ['Printer', '打印機'],
  stepChimes: ['Chimes', '鈴聲'],
  stepDone: ['Done', '完成'],
  passwordIntro: ['Choose the password that protects this page. Anyone on your network who opens it needs it.', '揀個密碼保護呢頁。網絡上任何人打開都要用佢。'],
  newPassword: ['New password', '新密碼'],
  printerIntro: ['The monitor talks to the printer over its LAN link. On the printer screen, find the IP address, the serial number and the LAN access code under Settings.', '監察器經區域網絡同打印機傾偈。喺打印機螢幕嘅設定入面搵 IP 地址、序號同區域網絡存取碼。'],
  host: ['Printer IP address', '打印機 IP 地址'],
  serial: ['Serial number', '序號'],
  accessCode: ['LAN access code', '區域網絡存取碼'],
  accessCodeKept: ['Saved. Leave empty to keep it.', '已儲存。留空就照用舊嗰個。'],
  connect: ['Save and connect', '儲存並連接'],
  chimesIntro: ['The printer can ring a chime when a door opens and another when it closes. Chimes wait while it is printing. You can skip this and turn it on later.', '門開同門關嘅時候，打印機可以各響一段鈴聲。打印緊嘅時候會等。可以跳過，遲啲先開。'],
  back: ['Back', '返回'],
  next: ['Next', '下一步'],
  skip: ['Skip', '跳過'],
  finish: ['Open the monitor', '打開監察器'],
  doneIntro: ['Everything is saved. The monitor keeps watching the doors while this page is closed.', '全部已儲存。就算閂咗呢頁，監察器都會繼續睇住道門。'],
  doors: ['Doors', '門'],
  front: ['Front door', '前門'],
  top: ['Top cover', '頂蓋'],
  left: ['Left door', '左門'],
  right: ['Right door', '右門'],
  open: ['Open', '開咗'],
  closed: ['Closed', '關咗'],
  unknown: ['Not reported', '未有報告'],
  connected: ['Connected', '已連接'],
  connecting: ['Connecting…', '連接緊…'],
  offline: ['Offline', '離線'],
  error: ['Connection problem', '連接出問題'],
  'not-configured': ['Printer not set up', '未設定打印機'],
  printState: ['Print state', '打印狀態'],
  noSensor: ['This printer does not report door detection.', '呢部打印機冇報告門偵測。'],
  lastReport: ['Last report', '最後報告'],
  log: ['Door log', '門記錄'],
  search: ['Search the log', '搜尋記錄'],
  regex: ['Regular expression', '正則表達式'],
  badRegex: ['That regular expression cannot be read.', '呢個正則表達式讀唔到。'],
  noEvents: ['No door has moved yet.', '道門仲未郁過。'],
  noMatches: ['Nothing in the log matches.', '記錄入面冇符合嘅。'],
  opened: ['opened', '打開'],
  closedEvent: ['closed', '關上'],
  openFor: ['open for', '開咗'],
  chimeColumn: ['Chime', '鈴聲'],
  chimePlayed: ['played', '已播'],
  chimeWaited: ['waited, printing', '打印緊，冇播'],
  chimeOff: ['off', '關閉'],
  chimeSilent: ['silent', '靜音'],
  chimeNoLink: ['printer not connected', '打印機未連接'],
  chimes: ['Door chime', '門鈴'],
  chimeSwitch: ['Play a chime when a door opens or closes', '門開或者關嘅時候響一下'],
  whenOpens: ['When a door opens', '門打開嘅時候'],
  whenCloses: ['When a door closes', '門關上嘅時候'],
  preview: ['Preview', '預覽'],
  previewSent: ['Sent to the printer.', '已傳去打印機。'],
  previewPrinting: ['The printer is printing, so the chime waits.', '打印機打印緊，鈴聲會等。'],
  previewOffline: ['Connect the printer first.', '請先連接打印機。'],
  chimeDoors: ['Doors that ring', '會響嘅門'],
  settings: ['Settings', '設定'],
  language: ['Language', '語言'],
  theme: ['Theme', '主題'],
  system: ['System', '跟系統'],
  light: ['Light', '淺色'],
  dark: ['Dark', '深色'],
  english: ['English', '英文'],
  cantonese: ['Cantonese', '廣東話'],
  bilingual: ['Both', '雙語'],
  printerSettings: ['Printer connection', '打印機連接'],
  saved: ['Saved.', '已儲存。'],
  changePassword: ['Change password', '更改密碼'],
  currentPassword: ['Current password', '目前密碼'],
  invalidHost: ['Enter the printer IP address, such as the one shown on the printer screen.', '請輸入打印機 IP 地址，即係打印機螢幕上面顯示嗰個。'],
  invalidSerial: ['Enter the serial number from the printer screen.', '請輸入打印機螢幕上面嘅序號。'],
  invalidCode: ['Enter the LAN access code from the printer screen.', '請輸入打印機螢幕上面嘅區域網絡存取碼。'],
  seconds: ['s', '秒'],
  minutes: ['min', '分鐘'],
  version: ['Version', '版本'],
};

let mode = 'en';
export function setMode(m) { mode = ['en', 'yue', 'both'].includes(m) ? m : 'en'; }
export function getMode() { return mode; }

export function t(key) {
  const pair = STRINGS[key];
  if (!pair) return key;
  if (mode === 'yue') return pair[1];
  if (mode === 'both') return pair[0] === pair[1] ? pair[0] : `${pair[0]} · ${pair[1]}`;
  return pair[0];
}

// A name that comes with its own Cantonese (the chime names).
export function named(en, yue) {
  if (mode === 'yue') return yue;
  if (mode === 'both') return `${en} · ${yue}`;
  return en;
}
