"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Eraser,
  FileJson,
  FolderOpen,
  Keyboard,
  MessageSquare,
  Music2,
  Pause,
  Pin,
  Play,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  Square,
  Timer,
  Trash2,
  Type,
  Upload,
  Wand2,
  X
} from "lucide-react";
import * as QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  convertPreservingKatakana,
  normalizeForSinging,
  parseReadingCorrections,
  roughHiragana,
  toVowels
} from "@/lib/japanese";

type ToolId =
  | "lyric"
  | "vowel"
  | "chord"
  | "vibrato"
  | "breath"
  | "scoop"
  | "fall"
  | "kobushi"
  | "accent"
  | "diction"
  | "hold"
  | "crescendo"
  | "decrescendo"
  | "dynamic"
  | "marker"
  | "note";

type ToolKind = "text" | "symbol" | "chord" | "note";

type ToolSpec = {
  id: ToolId;
  name: string;
  label: string;
  shortcut: string;
  color: string;
  size: number;
  kind: ToolKind;
};

type SheetItem = {
  id: string;
  toolId: ToolId;
  label: string;
  originalLabel?: string;
  readingLabel?: string;
  vowelLabel?: string;
  x: number;
  y: number;
  pageIndex?: number;
  size: number;
  color: string;
  highlightColor?: string;
  comment?: string;
  pitch?: number;
  durationTicks?: number;
  width?: number;
  align?: "left" | "center";
};

type SheetMeta = {
  title: string;
  vocalist: string;
  key: string;
  tempo: string;
  memo: string;
};

type DraftData = {
  meta: SheetMeta;
  items: SheetItem[];
  sourceLyrics: string;
  readingLyrics: string;
  readingCorrections?: string;
  vowelLyrics: string;
  sections?: SectionEntry[];
  showChords?: boolean;
  lyricDisplayMode?: LyricDisplayMode;
  sheetLayoutMode?: SheetLayoutMode;
  pinnedDictionMarks?: string[];
  autoScrollSettings?: AutoScrollSettings;
  sunoText?: string;
  midiMeasuresPerRow?: string;
};

type SavedSong = {
  id: string;
  title: string;
  vocalist?: string;
  updatedAt: string;
  draft: DraftData;
};

type SavedLyric = {
  id: string;
  title: string;
  updatedAt: string;
  sourceLyrics: string;
  readingLyrics: string;
  readingCorrections: string;
  vowelLyrics: string;
};

type SectionEntry = {
  id: string;
  name: string;
  rowIndex: number;
  startRow?: number;
  endRow?: number;
  order?: number;
  startMeasure?: string;
  recordingStartMeasure?: string;
  color: string;
};

type LyricDisplayMode = "original" | "reading" | "vowel";

type SheetLayoutMode = "lyricCard" | "staff";

type AutoScrollMode = "seconds" | "bpm";

type AutoScrollSettings = {
  mode: AutoScrollMode;
  durationSeconds: string;
  beatsPerMeasure: string;
  measuresPerRow: string;
  leadInSeconds: string;
  followAudio: boolean;
};

type LyricSectionBlock = {
  label: string;
  originalHeading: string;
  lines: string[];
};

type LyricLineVariant = {
  original?: string;
  reading?: string;
  vowel?: string;
};

type ReadingResult = {
  reading: string;
  source: string;
};

type PendingSheetTap = {
  pointerId: number;
  toolId: ToolId;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type BrowserKuroshiroConverter = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (
    text: string,
    options: { to: "hiragana"; mode: "normal" }
  ) => Promise<string>;
};

type ParsedMidiNote = {
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
  channel: number;
  track: number;
};

type ParsedMidi = {
  ppq: number;
  notes: ParsedMidiNote[];
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  name?: string;
};

type MidiInputLike = {
  name?: string | null;
  onmidimessage: ((this: any, event: any) => unknown) | null;
};

type MidiAccessLike = {
  inputs: {
    values: () => IterableIterator<MidiInputLike>;
  };
};

type PanelId =
  | "lyrics"
  | "suno"
  | "audio"
  | "library"
  | "midi"
  | "scroll"
  | "share"
  | "tools"
  | "settings"
  | "inspector"
  | "cleanup";

const STORAGE_KEY = "vocal-sheet-music:draft:v1";
const SONG_LIBRARY_STORAGE_KEY = "vocal-sheet-music:songs:v1";
const LYRIC_LIBRARY_STORAGE_KEY = "vocal-sheet-music:lyrics:v1";

const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const KUROMOJI_DICT_PATH = `${APP_BASE_PATH}/kuromoji/`;

let browserReadingConverterPromise: Promise<BrowserKuroshiroConverter> | null =
  null;

const DEFAULT_META: SheetMeta = {
  title: "新しい歌唱譜",
  vocalist: "",
  key: "C",
  tempo: "120",
  memo: ""
};

const DEFAULT_AUTO_SCROLL_SETTINGS: AutoScrollSettings = {
  mode: "bpm",
  durationSeconds: "180",
  beatsPerMeasure: "4",
  measuresPerRow: "4",
  leadInSeconds: "2",
  followAudio: true
};

const ALL_SHEET_TOOLS: ToolSpec[] = [
  {
    id: "lyric",
    name: "歌詞テキスト",
    label: "la",
    shortcut: "L",
    color: "#1f2937",
    size: 18,
    kind: "text"
  },
  {
    id: "vowel",
    name: "母音",
    label: "a",
    shortcut: "O",
    color: "#22d3ee",
    size: 16,
    kind: "text"
  },
  {
    id: "chord",
    name: "コード名",
    label: "C7",
    shortcut: "C",
    color: "#f59e0b",
    size: 20,
    kind: "chord"
  },
  {
    id: "note",
    name: "音符",
    label: "♪",
    shortcut: "N",
    color: "#111827",
    size: 18,
    kind: "note"
  },
  {
    id: "vibrato",
    name: "ビブラート",
    label: "W",
    shortcut: "V",
    color: "#22a85a",
    size: 18,
    kind: "symbol"
  },
  {
    id: "breath",
    name: "ブレス",
    label: "V",
    shortcut: "B",
    color: "#60a5fa",
    size: 18,
    kind: "symbol"
  },
  {
    id: "scoop",
    name: "しゃくり",
    label: "↗",
    shortcut: "S",
    color: "#dc2626",
    size: 18,
    kind: "symbol"
  },
  {
    id: "fall",
    name: "フォール",
    label: "↘",
    shortcut: "F",
    color: "#9333ea",
    size: 18,
    kind: "symbol"
  },
  {
    id: "kobushi",
    name: "こぶし",
    label: "○",
    shortcut: "U",
    color: "#0891b2",
    size: 18,
    kind: "symbol"
  },
  {
    id: "accent",
    name: "アクセント",
    label: ">",
    shortcut: "A",
    color: "#fb7185",
    size: 18,
    kind: "symbol"
  },
  {
    id: "diction",
    name: "滑舌注意",
    label: "活K",
    shortcut: "K",
    color: "#f97316",
    size: 18,
    kind: "symbol"
  },
  {
    id: "hold",
    name: "ロング",
    label: "━",
    shortcut: "H",
    color: "#facc15",
    size: 18,
    kind: "symbol"
  },
  {
    id: "crescendo",
    name: "クレッシェンド",
    label: "<",
    shortcut: "Q",
    color: "#334155",
    size: 18,
    kind: "symbol"
  },
  {
    id: "decrescendo",
    name: "デクレッシェンド",
    label: ">",
    shortcut: "E",
    color: "#334155",
    size: 18,
    kind: "symbol"
  },
  {
    id: "dynamic",
    name: "強弱",
    label: "mf",
    shortcut: "D",
    color: "#38bdf8",
    size: 18,
    kind: "text"
  },
  {
    id: "marker",
    name: "メモ印",
    label: "A",
    shortcut: "M",
    color: "#fb923c",
    size: 18,
    kind: "text"
  }
];

// 旧サイズ → 新サイズへの自動移行用（複数世代対応）
const LEGACY_SYMBOL_SIZES_BY_ID: Partial<Record<ToolId, number[]>> = {
  vibrato: [30, 23],
  breath: [26, 21],
  scoop: [28, 22],
  fall: [28, 22],
  kobushi: [30, 23],
  accent: [28, 22],
  diction: [24],
  hold: [28, 22],
  crescendo: [34, 25],
  decrescendo: [34, 25]
};

const SYSTEMS = [
  { top: 8, height: 9.8 },
  { top: 20.2, height: 9.8 },
  { top: 32.4, height: 9.8 },
  { top: 44.6, height: 9.8 },
  { top: 56.8, height: 9.8 },
  { top: 69, height: 9.8 },
  { top: 81.2, height: 9.8 }
];

const ROWS_PER_PAGE = SYSTEMS.length;
const MAX_SHEET_PAGES = 12;
const MAX_SHEET_ROWS = ROWS_PER_PAGE * MAX_SHEET_PAGES;

const LYRIC_LINE_X = 18;
const LYRIC_LINE_WIDTH = 70;

const SCORE_SCROLL_START = SYSTEMS[0].top;
const SCORE_SCROLL_END =
  SYSTEMS[SYSTEMS.length - 1].top + SYSTEMS[SYSTEMS.length - 1].height;

const COLOR_SWATCHES = [
  "#0ea5e9",
  "#22a85a",
  "#0891b2",
  "#dc2626",
  "#facc15",
  "#fb7185",
  "#4ade80",
  "#60a5fa",
  "#a78bfa",
  "#fb923c",
  "#f97316",
  "#f8fafc"
];

const HIGHLIGHT_SWATCHES = [
  "#fef08a",
  "#fed7aa",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#e9d5ff"
];

const COMMON_CHORDS = ["C", "Dm7", "Em7", "F", "G7", "Am7", "Bm7-5"];

const SECTION_PRESETS = [
  "Aメロ1",
  "Aメロ2",
  "Bメロ",
  "サビ",
  "Cメロ",
  "Dメロ",
  "間奏",
  "ラスサビ"
];

const SECTION_COLORS = [
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#475569"
];

const DEFAULT_SECTIONS: SectionEntry[] = [
  {
    id: "section-a1",
    name: "Aメロ1",
    rowIndex: 0,
    startRow: 0,
    endRow: 1,
    order: 0,
    startMeasure: "1",
    recordingStartMeasure: "0",
    color: SECTION_COLORS[0]
  },
  {
    id: "section-b",
    name: "Bメロ",
    rowIndex: 2,
    startRow: 2,
    endRow: 2,
    order: 1,
    startMeasure: "17",
    recordingStartMeasure: "16",
    color: SECTION_COLORS[2]
  },
  {
    id: "section-chorus",
    name: "サビ",
    rowIndex: 3,
    startRow: 3,
    endRow: 4,
    order: 2,
    startMeasure: "25",
    recordingStartMeasure: "24",
    color: SECTION_COLORS[3]
  }
];

const ART_SYMBOL_TOOL_IDS: ToolId[] = [
  "scoop",
  "fall",
  "vibrato",
  "kobushi",
  "breath",
  "crescendo",
  "decrescendo"
];

const DEFAULT_PINNED_DICTION_MARKS = ["K", "G", "S", "T", "N", "H", "M", "R"];

const AUDIO_DB_NAME = "vocal-sheet-music-audio";
const AUDIO_STORE_NAME = "audio";
const AUDIO_RECORD_ID = "current-song";

const DICTION_MARKS = [
  { value: "K", note: "カ行" },
  { value: "G", note: "ガ行" },
  { value: "S", note: "サ行" },
  { value: "z", note: "ザ行" },
  { value: "T", note: "タ行" },
  { value: "D", note: "ダ行" },
  { value: "N", note: "ナ行" },
  { value: "H", note: "ハ行" },
  { value: "B", note: "バ行" },
  { value: "P", note: "パ行" },
  { value: "m", note: "マ行" },
  { value: "Y", note: "ヤ行" },
  { value: "R", note: "ラ行" },
  { value: "L", note: "L/R" },
  { value: "W", note: "ワ行" },
  { value: "sh", note: "SH" },
  { value: "ch", note: "CH" },
  { value: "j", note: "J" },
  { value: "th", note: "TH" },
  { value: "f", note: "F" },
  { value: "v", note: "V" },
  { value: "ng", note: "NG" }
];

const DICTION_GROUPS = [
  {
    label: "日本語 50音順",
    values: [
      "K",
      "G",
      "S",
      "z",
      "T",
      "D",
      "N",
      "H",
      "B",
      "P",
      "m",
      "Y",
      "R",
      "L",
      "W"
    ]
  },
  {
    label: "英語・特殊",
    values: ["sh", "ch", "j", "th", "f", "v", "ng"]
  }
];

const SHEET_TOOLS = ALL_SHEET_TOOLS.filter(
  (tool) => !["lyric", "note"].includes(tool.id)
);

const TOOL_BY_ID = ALL_SHEET_TOOLS.reduce(
  (lookup, tool) => ({ ...lookup, [tool.id]: tool }),
  {} as Record<ToolId, ToolSpec>
);

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function formatSavedSongDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getSavedLyricTitle(meta: SheetMeta, sourceLyrics: string) {
  const metaTitle = meta.title.trim();
  if (metaTitle && metaTitle !== DEFAULT_META.title) {
    return metaTitle;
  }

  const firstLine = sourceLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.slice(0, 28) : "無題の歌詞";
}

function parsePositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAutoScrollLeadIn(settings: AutoScrollSettings) {
  return Math.max(Number(settings.leadInSeconds) || 0, 0);
}

function getAutoScrollDurationSeconds(
  settings: AutoScrollSettings,
  tempo: string
) {
  const leadInSeconds = getAutoScrollLeadIn(settings);

  if (settings.mode === "seconds") {
    return Math.max(parsePositiveNumber(settings.durationSeconds, 180), leadInSeconds + 1);
  }

  const bpm = parsePositiveNumber(tempo, 120);
  const beatsPerMeasure = parsePositiveNumber(settings.beatsPerMeasure, 4);
  const measuresPerRow = parsePositiveNumber(settings.measuresPerRow, 4);
  const rowSeconds = (measuresPerRow * beatsPerMeasure * 60) / bpm;

  return leadInSeconds + rowSeconds * SYSTEMS.length;
}

function getAutoScrollProgress(
  elapsedSeconds: number,
  durationSeconds: number,
  leadInSeconds: number
) {
  if (elapsedSeconds <= leadInSeconds) {
    return 0;
  }

  return clamp(
    (elapsedSeconds - leadInSeconds) /
      Math.max(durationSeconds - leadInSeconds, 1),
    0,
    1
  );
}

function getSectionStartRow(section: SectionEntry) {
  return clamp(section.startRow ?? section.rowIndex ?? 0, 0, MAX_SHEET_ROWS - 1);
}

function getSectionEndRow(section: SectionEntry) {
  return clamp(
    section.endRow ?? section.startRow ?? section.rowIndex ?? 0,
    0,
    MAX_SHEET_ROWS - 1
  );
}

function getRowPageIndex(rowIndex: number) {
  return Math.floor(clamp(rowIndex, 0, MAX_SHEET_ROWS - 1) / ROWS_PER_PAGE);
}

function getRowLocalIndex(rowIndex: number) {
  return clamp(rowIndex, 0, MAX_SHEET_ROWS - 1) % ROWS_PER_PAGE;
}

function getSystemForRow(rowIndex: number) {
  return SYSTEMS[getRowLocalIndex(rowIndex)] ?? SYSTEMS[0];
}

function getItemPageIndex(item: SheetItem) {
  const pageIndex = Number.isFinite(item.pageIndex) ? item.pageIndex ?? 0 : 0;
  return clamp(Math.floor(pageIndex), 0, MAX_SHEET_PAGES - 1);
}

function getItemGlobalRowIndex(item: SheetItem) {
  const localRowIndex = SYSTEMS.findIndex(
    (system) => item.y >= system.top && item.y <= system.top + system.height
  );

  return getItemPageIndex(item) * ROWS_PER_PAGE + Math.max(localRowIndex, 0);
}

function normalizeSections(sections: SectionEntry[] | undefined) {
  return (sections ?? DEFAULT_SECTIONS)
    .map((section, index) => {
      const startRow = Math.min(getSectionStartRow(section), getSectionEndRow(section));
      const endRow = Math.max(getSectionStartRow(section), getSectionEndRow(section));

      return {
        ...section,
        rowIndex: startRow,
        startRow,
        endRow,
        order: section.order ?? index,
        startMeasure: section.startMeasure ?? "",
        recordingStartMeasure: section.recordingStartMeasure ?? "",
        color: section.color ?? SECTION_COLORS[index % SECTION_COLORS.length]
      };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function encodeShareData(draft: DraftData) {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeShareData(payload: string) {
  const binary = atob(payload.trim());
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Partial<DraftData>;
}

async function getBrowserReadingConverter() {
  if (!browserReadingConverterPromise) {
    browserReadingConverterPromise = (async () => {
      const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] =
        await Promise.all([
          import("kuroshiro"),
          import("kuroshiro-analyzer-kuromoji")
        ]);
      const converter = new Kuroshiro() as BrowserKuroshiroConverter;
      await converter.init(new KuromojiAnalyzer({ dictPath: KUROMOJI_DICT_PATH }));
      return converter;
    })();
  }

  return browserReadingConverterPromise;
}

async function convertWithBrowserKuromoji(text: string, correctionText = "") {
  const converter = await getBrowserReadingConverter();
  const corrections = parseReadingCorrections(correctionText);
  const reading = await convertPreservingKatakana(
    text,
    (segment) => converter.convert(segment, { to: "hiragana", mode: "normal" }),
    corrections
  );

  return normalizeForSinging(reading);
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
}

function normalizeFullWidthAlnum(value: string) {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
}

function splitLinesForPlacement(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getLyricPlacementY(
  system: (typeof SYSTEMS)[number],
  toolId: Extract<ToolId, "lyric" | "vowel">,
  layoutMode: SheetLayoutMode
) {
  const baseRatio = layoutMode === "staff" ? 0.86 : 0.8;
  const vowelOffset = layoutMode === "staff" ? 0.07 : 0.1;
  const laneRatio = toolId === "vowel" ? baseRatio + vowelOffset : baseRatio;
  return system.top + system.height * laneRatio;
}

function getNearestLocalRowIndex(y: number) {
  const exactIndex = SYSTEMS.findIndex(
    (system) => y >= system.top && y <= system.top + system.height
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return SYSTEMS.reduce(
    (nearest, system, index) => {
      const center = system.top + system.height / 2;
      const distance = Math.abs(center - y);
      return distance < nearest.distance ? { index, distance } : nearest;
    },
    { index: 0, distance: Number.POSITIVE_INFINITY }
  ).index;
}

function getRowIndexForPageY(pageIndex: number, y: number) {
  return (
    clamp(pageIndex, 0, MAX_SHEET_PAGES - 1) * ROWS_PER_PAGE +
    getNearestLocalRowIndex(y)
  );
}

function getChordPlacementY(rowIndex: number, layoutMode: SheetLayoutMode) {
  const system = getSystemForRow(rowIndex);
  const laneRatio = layoutMode === "staff" ? 0.13 : 0.15;
  return system.top + system.height * laneRatio;
}

// 記号を行の垂直中央にスナップするY座標を返す
function getSymbolSnapY(pageIndex: number, y: number) {
  const rowIndex = getRowIndexForPageY(pageIndex, y);
  const system = getSystemForRow(rowIndex);
  return system.top + system.height * 0.5;
}

function normalizeSectionHeadingText(value: string) {
  return normalizeFullWidthAlnum(value)
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^[\[【「『(（]+/, "")
    .replace(/[\]】」』)）]+$/, "")
    .replace(/[：:]$/, "")
    .trim();
}

function compactSectionKey(value: string) {
  return normalizeSectionHeadingText(value)
    .replace(/[\s　_-]+/g, "")
    .toLowerCase();
}

function getSectionBaseKey(value: string) {
  const key = compactSectionKey(value);
  if (/^aメロ\d*$/.test(key)) {
    return "aメロ";
  }
  if (/^bメロ\d*$/.test(key)) {
    return "bメロ";
  }
  if (/^cメロ\d*$/.test(key)) {
    return "cメロ";
  }
  if (/^dメロ\d*$/.test(key)) {
    return "dメロ";
  }
  if (/^サビ\d*$/.test(key)) {
    return "サビ";
  }
  if (/^間奏\d*$/.test(key)) {
    return "間奏";
  }
  if (/^イントロ\d*$/.test(key)) {
    return "イントロ";
  }
  if (/^アウトロ\d*$/.test(key)) {
    return "アウトロ";
  }
  if (/^ギターソロ\d*$/.test(key)) {
    return "ギターソロ";
  }
  return key;
}

function getSectionLabelFromHeading(line: string) {
  const heading = normalizeSectionHeadingText(line);
  const key = compactSectionKey(heading);

  let match = key.match(/^aメロ(\d*)$/);
  if (match) {
    return `Aメロ${match[1] || ""}`;
  }

  match = key.match(/^bメロ(\d*)$/);
  if (match) {
    return `Bメロ${match[1] || ""}`;
  }

  match = key.match(/^cメロ(\d*)$/);
  if (match) {
    return `Cメロ${match[1] || ""}`;
  }

  match = key.match(/^dメロ(\d*)$/);
  if (match) {
    return `Dメロ${match[1] || ""}`;
  }

  match = key.match(/^サビ(\d*)$/);
  if (match) {
    return `サビ${match[1] || ""}`;
  }

  if (/^ラスサビ$/.test(key)) {
    return "ラスサビ";
  }

  match = key.match(/^イントロ(\d*)$/);
  if (match) {
    return `イントロ${match[1] || ""}`;
  }

  match = key.match(/^間奏(\d*)$/);
  if (match) {
    return `間奏${match[1] || ""}`;
  }

  match = key.match(/^アウトロ(\d*)$/);
  if (match) {
    return `アウトロ${match[1] || ""}`;
  }

  match = key.match(/^ギターソロ(\d*)$/);
  if (match) {
    return `ギターソロ${match[1] || ""}`;
  }

  match = key.match(/^verse(\d*)$/);
  if (match) {
    return `Aメロ${match[1] || ""}`;
  }

  match = key.match(/^prechorus(\d*)$/);
  if (match) {
    return `Bメロ${match[1] || ""}`;
  }

  match = key.match(/^chorus(\d*)$/);
  if (match) {
    return `サビ${match[1] || ""}`;
  }

  match = key.match(/^bridge(\d*)$/);
  if (match) {
    return `Cメロ${match[1] || ""}`;
  }

  if (key === "intro") {
    return "イントロ";
  }

  if (key === "outro") {
    return "アウトロ";
  }

  if (key === "guitarsolo") {
    return "ギターソロ";
  }

  return "";
}

function getImplicitNumberBase(label: string) {
  const match = compactSectionKey(label).match(/^(aメロ|bメロ|cメロ|dメロ|サビ)(\d*)$/);
  return match?.[2] ? "" : match?.[1] ?? "";
}

function getExplicitSectionNumber(label: string) {
  const match = compactSectionKey(label).match(/^(aメロ|bメロ|cメロ|dメロ|サビ)(\d+)$/);
  return match ? Number(match[2]) : 0;
}

function applyImplicitSectionNumber(
  label: string,
  counters: Record<string, number>
) {
  const explicitNumber = getExplicitSectionNumber(label);
  const exactBase = getImplicitNumberBase(label);

  if (explicitNumber > 0) {
    const base = getSectionBaseKey(label);
    counters[base] = Math.max(counters[base] ?? 0, explicitNumber);
    return label;
  }

  if (!exactBase) {
    return label;
  }

  counters[exactBase] = (counters[exactBase] ?? 0) + 1;
  const displayBase =
    exactBase === "aメロ"
      ? "Aメロ"
      : exactBase === "bメロ"
        ? "Bメロ"
        : exactBase === "cメロ"
          ? "Cメロ"
          : exactBase === "dメロ"
            ? "Dメロ"
            : "サビ";

  return `${displayBase}${counters[exactBase]}`;
}

function parseSectionedLyrics(input: string) {
  const blocks: LyricSectionBlock[] = [];
  const preHeadingLines: string[] = [];
  const sectionCounters: Record<string, number> = {};
  let currentBlock: LyricSectionBlock | null = null;
  let foundHeading = false;

  input.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    const rawSectionLabel = getSectionLabelFromHeading(line);
    if (rawSectionLabel) {
      const sectionLabel = applyImplicitSectionNumber(
        rawSectionLabel,
        sectionCounters
      );
      if (currentBlock) {
        blocks.push(currentBlock);
      } else if (preHeadingLines.length > 0) {
        blocks.push({
          label: "Aメロ1",
          originalHeading: "Aメロ1",
          lines: [...preHeadingLines]
        });
        preHeadingLines.length = 0;
      }

      currentBlock = {
        label: sectionLabel,
        originalHeading: line,
        lines: []
      };
      foundHeading = true;
      return;
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      preHeadingLines.push(line);
    }
  });

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return foundHeading ? blocks.filter((block) => block.lines.length > 0) : [];
}

function flattenLyricLines(input: string) {
  const blocks = parseSectionedLyrics(input);
  if (blocks.length > 0) {
    return blocks.flatMap((block) => block.lines);
  }

  return splitLinesForPlacement(input);
}

// readingLyrics テキスト内の targetIndex 番目の歌詞行を newValue に置き換える
// セクションヘッダー行（Aメロ1 等）はカウントしない
function updateReadingLyricsLine(text: string, targetIndex: number, newValue: string): string {
  const lines = text.split(/\r?\n/);
  let lyricLineCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }

    if (getSectionLabelFromHeading(trimmed)) {
      continue; // セクションヘッダーはスキップ
    }

    if (lyricLineCount === targetIndex) {
      lines[i] = newValue;
      return lines.join("\n");
    }

    lyricLineCount += 1;
  }

  return text; // 対応行が見つからない場合はそのまま返す
}

function convertSectionedTextToVowels(input: string) {
  const blocks = parseSectionedLyrics(input);
  if (!blocks.length) {
    return toVowels(input);
  }

  return blocks
    .map((block) => `${block.label}\n${toVowels(block.lines.join("\n"))}`)
    .join("\n");
}

function findMatchingSection(
  sectionLabel: string,
  candidateSections: SectionEntry[]
) {
  const exactKey = compactSectionKey(sectionLabel);
  const baseKey = getSectionBaseKey(sectionLabel);

  return (
    candidateSections.find((section) => compactSectionKey(section.name) === exactKey) ??
    candidateSections.find((section) => getSectionBaseKey(section.name) === baseKey)
  );
}

function createSectionsFromLyricBlocks(
  blocks: LyricSectionBlock[],
  currentSections: SectionEntry[]
) {
  const existingSections = normalizeSections(currentSections);
  const nextSections: SectionEntry[] = [];
  let nextRow = 0;

  blocks.forEach((block, index) => {
    if (nextRow >= MAX_SHEET_ROWS) {
      return;
    }

    const matchedSection = findMatchingSection(block.label, existingSections);
    const rowsNeeded = Math.max(block.lines.length, 1);
    const startRow = nextRow;
    const endRow = Math.min(MAX_SHEET_ROWS - 1, startRow + rowsNeeded - 1);

    nextSections.push({
      id: matchedSection?.id ?? createId(),
      name: block.label,
      rowIndex: startRow,
      startRow,
      endRow,
      order: index,
      startMeasure: matchedSection?.startMeasure ?? "",
      recordingStartMeasure: matchedSection?.recordingStartMeasure ?? "",
      color: matchedSection?.color ?? SECTION_COLORS[index % SECTION_COLORS.length]
    });

    nextRow = endRow + 1;
  });

  return normalizeSections(nextSections);
}

function getSectionNumber(sectionName: string) {
  return normalizeDigits(sectionName).match(/\d+/)?.[0] ?? "1";
}

function getSunoMetaTag(sectionName: string) {
  const compactName = normalizeDigits(sectionName).replace(/\s+/g, "");

  if (/^\[[^\]]+\]$/.test(compactName)) {
    return compactName;
  }

  if (compactName.includes("イントロ")) {
    return "[Intro]";
  }

  if (compactName.includes("ギターソロ") || /guitarsolo/i.test(compactName)) {
    return "[Guitar solo]";
  }

  if (compactName.includes("アウトロ")) {
    return "[Outro]";
  }

  if (compactName.includes("Aメロ")) {
    return `[Verse${getSectionNumber(compactName)}]`;
  }

  if (compactName.includes("Bメロ")) {
    return `[Prechorus${getSectionNumber(compactName)}]`;
  }

  if (compactName.includes("サビ")) {
    return `[Chorus${getSectionNumber(compactName)}]`;
  }

  if (compactName.includes("間奏") || compactName.includes("Cメロ")) {
    return `[Bridge${getSectionNumber(compactName)}]`;
  }

  return `[${sectionName.trim() || "Section"}]`;
}

const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
];

const PITCH_TO_DIATONIC_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

class MidiReader {
  private offset = 0;

  constructor(private readonly view: DataView) {}

  get position() {
    return this.offset;
  }

  set position(nextOffset: number) {
    this.offset = nextOffset;
  }

  readUint8() {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16() {
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  readUint32() {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  readString(length: number) {
    let value = "";
    for (let index = 0; index < length; index += 1) {
      value += String.fromCharCode(this.readUint8());
    }
    return value;
  }

  readVariableLength() {
    let value = 0;
    let byte = 0;

    do {
      byte = this.readUint8();
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);

    return value;
  }

  skip(length: number) {
    this.offset += length;
  }
}

function midiPitchName(pitch: number) {
  return `${PITCH_CLASS_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function midiPitchToStaffY(pitch: number, rowIndex: number) {
  const system = getSystemForRow(rowIndex);
  const staffTop = system.top + system.height * 0.35;
  const staffHeight = system.height * 0.32;
  const pitchClass = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const noteStep = octave * 7 + PITCH_TO_DIATONIC_STEP[pitchClass];
  const topStep = 5 * 7 + 3;
  const relative = (topStep - noteStep) / 8;

  return clamp(staffTop + staffHeight * relative, system.top + 2.8, system.top + system.height - 1.4);
}

function parseMidiFile(buffer: ArrayBuffer): ParsedMidi {
  const reader = new MidiReader(new DataView(buffer));
  const headerId = reader.readString(4);
  if (headerId !== "MThd") {
    throw new Error("MIDIヘッダーが見つかりません");
  }

  const headerLength = reader.readUint32();
  reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();

  if (division & 0x8000) {
    throw new Error("SMPTE形式のMIDIにはまだ対応していません");
  }

  reader.skip(Math.max(headerLength - 6, 0));

  const notes: ParsedMidiNote[] = [];
  const activeNotes = new Map<
    string,
    Array<{ startTick: number; velocity: number; track: number }>
  >();
  let timeSignature = { numerator: 4, denominator: 4 };
  let name = "";

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const trackId = reader.readString(4);
    if (trackId !== "MTrk") {
      throw new Error("MIDIトラックが見つかりません");
    }

    const trackEnd = reader.position + reader.readUint32();
    let tick = 0;
    let runningStatus = 0;

    while (reader.position < trackEnd) {
      tick += reader.readVariableLength();
      let status = reader.readUint8();

      if (status < 0x80) {
        reader.position -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = reader.readUint8();
        const length = reader.readVariableLength();
        const metaStart = reader.position;

        if (metaType === 0x03) {
          name ||= reader.readString(length);
        } else if (metaType === 0x58 && length >= 2) {
          const numerator = reader.readUint8();
          const denominatorPower = reader.readUint8();
          timeSignature = {
            numerator,
            denominator: 2 ** denominatorPower
          };
        }

        reader.position = metaStart + length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        reader.skip(reader.readVariableLength());
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const firstData = reader.readUint8();
      const needsSecondData = ![0xc0, 0xd0].includes(eventType);
      const secondData = needsSecondData ? reader.readUint8() : 0;

      if (eventType !== 0x90 && eventType !== 0x80) {
        continue;
      }

      const key = `${channel}:${firstData}`;
      const noteStack = activeNotes.get(key) ?? [];

      if (eventType === 0x90 && secondData > 0) {
        activeNotes.set(key, [
          ...noteStack,
          { startTick: tick, velocity: secondData, track: trackIndex }
        ]);
      } else {
        const started = noteStack.shift();
        if (started) {
          notes.push({
            pitch: firstData,
            velocity: started.velocity,
            startTick: started.startTick,
            endTick: tick,
            channel,
            track: started.track
          });
        }
        activeNotes.set(key, noteStack);
      }
    }

    reader.position = trackEnd;
  }

  return {
    ppq: division,
    notes: notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch),
    timeSignature,
    name
  };
}

function detectChordName(pitches: number[]) {
  const pitchClasses = [...new Set(pitches.map((pitch) => pitch % 12))];
  if (pitchClasses.length < 3) {
    return "";
  }

  const bass = Math.min(...pitches) % 12;
  const candidates = pitchClasses
    .map((root) => {
      const intervals = pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12);
      const has = (interval: number) => intervals.includes(interval);
      const triads = [
        { quality: "", score: has(4) && has(7) ? 3 : 0 },
        { quality: "m", score: has(3) && has(7) ? 3 : 0 },
        { quality: "dim", score: has(3) && has(6) ? 3 : 0 },
        { quality: "aug", score: has(4) && has(8) ? 3 : 0 },
        { quality: "sus2", score: has(2) && has(7) ? 2 : 0 },
        { quality: "sus4", score: has(5) && has(7) ? 2 : 0 }
      ];
      const bestTriad = triads.sort((a, b) => b.score - a.score)[0];
      const extension = has(11) ? "maj7" : has(10) ? "7" : "";

      return {
        root,
        quality: bestTriad.quality,
        extension,
        score: bestTriad.score + (extension ? 1 : 0)
      };
    })
    .filter((candidate) => candidate.score >= 3)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return "";
  }

  const chordName = `${PITCH_CLASS_NAMES[best.root]}${best.quality}${best.extension}`;
  return bass !== best.root ? `${chordName}/${PITCH_CLASS_NAMES[bass]}` : chordName;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function isToolId(value: string): value is ToolId {
  return value in TOOL_BY_ID;
}

function isSheetLyricItem(item: SheetItem) {
  return item.toolId === "lyric" || item.toolId === "vowel";
}

function normalizeDraftItems(items: SheetItem[]) {
  return items.map((item) => {
    const tool = TOOL_BY_ID[item.toolId];
    const legacySizes = LEGACY_SYMBOL_SIZES_BY_ID[item.toolId];
    const pageIndex = getItemPageIndex(item);
    const normalizedItem = { ...item, pageIndex };

    // 旧サイズ（複数世代）のいずれかに一致したら新サイズへ移行
    if (tool?.kind === "symbol" && legacySizes?.includes(item.size)) {
      return { ...normalizedItem, size: tool.size };
    }

    return normalizedItem;
  });
}

function isArtSymbolTool(toolId: ToolId) {
  return ART_SYMBOL_TOOL_IDS.includes(toolId);
}

function formatDictionMark(value: string) {
  const trimmed = value.trim();
  return `活${trimmed || "K"}`;
}

function renderToolGlyph(toolId: ToolId, label: string) {
  if (!isArtSymbolTool(toolId)) {
    return label;
  }

  return (
    <span className={`symbol-art symbol-${toolId}`} aria-label={label}>
      <span />
    </span>
  );
}

type StoredAudio = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
};

function openAudioDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(AUDIO_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        database.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredAudio(file: File) {
  const database = await openAudioDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, "readwrite");
      transaction
        .objectStore(AUDIO_STORE_NAME)
        .put({
          id: AUDIO_RECORD_ID,
          name: file.name,
          type: file.type,
          blob: file
        } satisfies StoredAudio);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function loadStoredAudio() {
  const database = await openAudioDatabase();

  try {
    return await new Promise<StoredAudio | null>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, "readonly");
      const request = transaction
        .objectStore(AUDIO_STORE_NAME)
        .get(AUDIO_RECORD_ID);

      request.onsuccess = () => resolve((request.result as StoredAudio) ?? null);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteStoredAudio() {
  const database = await openAudioDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, "readwrite");
      transaction.objectStore(AUDIO_STORE_NAME).delete(AUDIO_RECORD_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export default function Home() {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scoreStageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const midiInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const midiAccessRef = useRef<MidiAccessLike | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollStartTimeRef = useRef(0);
  const pendingSheetTapRef = useRef<PendingSheetTap | null>(null);
  const [meta, setMeta] = useState<SheetMeta>(DEFAULT_META);
  const [items, setItems] = useState<SheetItem[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId | "">("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [editingItemId, setEditingItemId] = useState<string>("");
  const [dragging, setDragging] = useState<{
    id: string;
    pageIndex: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [sourceLyrics, setSourceLyrics] = useState(
    "雨上がりの空に 君の声がひびく\n明日へ続く道を もう一度歩こう"
  );
  const [readingLyrics, setReadingLyrics] = useState("");
  const [readingCorrections, setReadingCorrections] = useState("");
  const [vowelLyrics, setVowelLyrics] = useState("");
  const [quickChord, setQuickChord] = useState("C");
  const [dictionMark, setDictionMark] = useState("K");
  const [showChords, setShowChords] = useState(true);
  const [lyricDisplayMode, setLyricDisplayMode] =
    useState<LyricDisplayMode>("original");
  const [sheetLayoutMode, setSheetLayoutMode] =
    useState<SheetLayoutMode>("lyricCard");
  const [sections, setSections] = useState<SectionEntry[]>(DEFAULT_SECTIONS);
  const [sectionStartRow, setSectionStartRow] = useState(0);
  const [sectionEndRow, setSectionEndRow] = useState(1);
  const [sectionName, setSectionName] = useState(SECTION_PRESETS[0]);
  const [sectionStartMeasure, setSectionStartMeasure] = useState("1");
  const [sectionRecordingStartMeasure, setSectionRecordingStartMeasure] =
    useState("0");
  const [midiMeasuresPerRow, setMidiMeasuresPerRow] = useState("4");
  const [midiStatus, setMidiStatus] = useState("MIDI未読み込み");
  const [pinnedDictionMarks, setPinnedDictionMarks] = useState(
    DEFAULT_PINNED_DICTION_MARKS
  );
  const [sharePayload, setSharePayload] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareQrCode, setShareQrCode] = useState("");
  const [sunoText, setSunoText] = useState("");
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [songLibrarySelectionId, setSongLibrarySelectionId] = useState("");
  const [savedLyrics, setSavedLyrics] = useState<SavedLyric[]>([]);
  const [lyricLibrarySelectionId, setLyricLibrarySelectionId] = useState("");
  const [autoScrollSettings, setAutoScrollSettings] =
    useState<AutoScrollSettings>(DEFAULT_AUTO_SCROLL_SETTINGS);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [autoScrollElapsed, setAutoScrollElapsed] = useState(0);
  const [audioName, setAudioName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [status, setStatus] = useState("準備OK");
  const [isConverting, setIsConverting] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState<
    Record<PanelId, boolean>
  >({
    lyrics: false,
    suno: false,
    audio: false,
    midi: false,
    scroll: false,
    share: false,
    library: false,
    tools: false,
    settings: false,
    inspector: false,
    cleanup: false
  });

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId]
  );
  const activeToolSpec = activeTool ? TOOL_BY_ID[activeTool] : null;
  const readingCorrectionEntries = useMemo(
    () => parseReadingCorrections(readingCorrections),
    [readingCorrections]
  );

  const lyricDisplayFallbacks = useMemo(() => {
    const originalLines = flattenLyricLines(sourceLyrics);
    const readingLines = flattenLyricLines(readingLyrics);
    const vowelLines = flattenLyricLines(vowelLyrics);
    const lyricItems = items
      .filter((item) => item.toolId === "lyric")
      .slice()
      .sort(
        (a, b) =>
          getItemGlobalRowIndex(a) - getItemGlobalRowIndex(b) || a.x - b.x
      );
    const fallbackMap = new Map<
      string,
      { original?: string; reading?: string; vowel?: string }
    >();

    lyricItems.forEach((item, index) => {
      fallbackMap.set(item.id, {
        original: originalLines[index],
        reading: readingLines[index],
        vowel: vowelLines[index]
      });
    });

    return fallbackMap;
  }, [items, readingLyrics, sourceLyrics, vowelLyrics]);

  const normalizedSections = useMemo(() => normalizeSections(sections), [sections]);

  const sectionByRow = useMemo(() => {
    const rowMap = new Map<
      number,
      { section: SectionEntry; rowPart: number; rowTotal: number }
    >();

    normalizeSections(sections)
      .slice()
      .sort((a, b) => getSectionStartRow(a) - getSectionStartRow(b))
      .forEach((section) => {
        const startRow = getSectionStartRow(section);
        const endRow = getSectionEndRow(section);
        const rowTotal = endRow - startRow + 1;

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
          rowMap.set(rowIndex, {
            section,
            rowPart: rowIndex - startRow + 1,
            rowTotal
          });
        }
      });

    return rowMap;
  }, [sections]);

  const sectionNameOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...SECTION_PRESETS,
          ...normalizedSections.map((section) => section.name)
        ])
      ).filter(Boolean),
    [normalizedSections]
  );

  const selectedItemRowIndex = selectedItem
    ? getItemGlobalRowIndex(selectedItem)
    : -1;
  const selectedItemSectionName =
    selectedItemRowIndex >= 0
      ? sectionByRow.get(selectedItemRowIndex)?.section.name ?? ""
      : "";

  const sheetPageCount = useMemo(() => {
    const maxSectionRow = normalizedSections.reduce(
      (maxRow, section) => Math.max(maxRow, getSectionEndRow(section)),
      0
    );
    const maxItemPage = items.reduce(
      (maxPage, item) => Math.max(maxPage, getItemPageIndex(item)),
      0
    );
    const rowsNeeded = Math.max(maxSectionRow, sectionEndRow, 0) + 1;

    return clamp(
      Math.max(Math.ceil(rowsNeeded / ROWS_PER_PAGE), maxItemPage + 1, 1),
      1,
      MAX_SHEET_PAGES
    );
  }, [items, normalizedSections, sectionEndRow]);

  const sheetPages = useMemo(
    () => Array.from({ length: sheetPageCount }, (_, pageIndex) => pageIndex),
    [sheetPageCount]
  );

  const sectionRowOptions = useMemo(
    () =>
      Array.from(
        { length: Math.min(sheetPageCount * ROWS_PER_PAGE, MAX_SHEET_ROWS) },
        (_, rowIndex) => rowIndex
      ),
    [sheetPageCount]
  );

  const pinnedDictionOptions = useMemo(
    () =>
      pinnedDictionMarks
        .map((value) => DICTION_MARKS.find((mark) => mark.value === value))
        .filter((mark): mark is (typeof DICTION_MARKS)[number] => Boolean(mark)),
    [pinnedDictionMarks]
  );

  const autoScrollDurationSeconds = useMemo(
    () => getAutoScrollDurationSeconds(autoScrollSettings, meta.tempo),
    [autoScrollSettings, meta.tempo]
  );

  const autoScrollLeadInSeconds = useMemo(
    () => getAutoScrollLeadIn(autoScrollSettings),
    [autoScrollSettings]
  );

  const autoScrollProgress = useMemo(
    () =>
      getAutoScrollProgress(
        autoScrollElapsed,
        autoScrollDurationSeconds,
        autoScrollLeadInSeconds
      ),
    [autoScrollDurationSeconds, autoScrollElapsed, autoScrollLeadInSeconds]
  );

  const autoScrollGuideTop = useMemo(
    () =>
      SCORE_SCROLL_START +
      (SCORE_SCROLL_END - SCORE_SCROLL_START) * autoScrollProgress,
    [autoScrollProgress]
  );

  const togglePanel = useCallback((panelId: PanelId) => {
    setCollapsedPanels((current) => ({
      ...current,
      [panelId]: !current[panelId]
    }));
  }, []);

  const draft = useMemo<DraftData>(
    () => ({
      meta,
      items,
      sourceLyrics,
      readingLyrics,
      readingCorrections,
      vowelLyrics,
      sections,
      showChords,
      lyricDisplayMode,
      sheetLayoutMode,
      pinnedDictionMarks,
      autoScrollSettings,
      sunoText,
      midiMeasuresPerRow
    }),
    [
      autoScrollSettings,
      items,
      lyricDisplayMode,
      meta,
      midiMeasuresPerRow,
      pinnedDictionMarks,
      readingCorrections,
      readingLyrics,
      sections,
      sheetLayoutMode,
      showChords,
      sunoText,
      sourceLyrics,
      vowelLyrics
    ]
  );

  const getItemDisplayLabel = useCallback(
    (item: SheetItem) => {
      if (item.toolId !== "lyric") {
        return item.label;
      }

      const fallback = lyricDisplayFallbacks.get(item.id);
      const originalLabel = item.originalLabel ?? fallback?.original ?? item.label;
      // 譜面上で直接編集した readingLabel を優先（再起動後も保持される）
      // 未編集の場合は readingLyrics テキスト（fallback）を使う
      const readingLabel =
        item.readingLabel ??
        fallback?.reading ??
        roughHiragana(originalLabel, readingCorrectionEntries);
      const vowelLabel = item.vowelLabel ?? fallback?.vowel ?? toVowels(readingLabel);

      if (lyricDisplayMode === "reading") {
        return readingLabel;
      }

      if (lyricDisplayMode === "vowel") {
        return vowelLabel;
      }

      return originalLabel;
    },
    [lyricDisplayFallbacks, lyricDisplayMode, readingCorrectionEntries]
  );

  const replaceAudioSource = useCallback((blob: Blob, name: string) => {
    const nextUrl = URL.createObjectURL(blob);
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    setAudioName(name);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setIsAudioPlaying(false);
  }, []);

  const getPointerPositionInElement = useCallback(
    (clientX: number, clientY: number, element: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect();
      if (!rect) {
        return { x: 50, y: 50 };
      }

      return {
        x: clamp(((clientX - rect.left) / rect.width) * 100, 3, 97),
        y: clamp(((clientY - rect.top) / rect.height) * 100, 3, 97)
      };
    },
    []
  );

  const getScorePageElement = useCallback((pageIndex: number) => {
    const selector = `.score-page[data-page-index="${pageIndex}"]`;
    return scoreStageRef.current?.querySelector<HTMLElement>(selector) ?? null;
  }, []);

  const getPointerPositionForPage = useCallback(
    (clientX: number, clientY: number, pageIndex: number) =>
      getPointerPositionInElement(
        clientX,
        clientY,
        getScorePageElement(pageIndex) ?? sheetRef.current
      ),
    [getPointerPositionInElement, getScorePageElement]
  );

  const getPointerPosition = useCallback((clientX: number, clientY: number) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 50, y: 50 };
    }

    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 3, 97),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 3, 97)
    };
  }, []);

  const updateAutoScrollSetting = useCallback(
    <Key extends keyof AutoScrollSettings>(
      key: Key,
      value: AutoScrollSettings[Key]
    ) => {
      setAutoScrollSettings((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const scrollScoreToProgress = useCallback((progress: number) => {
    const scoreStage = scoreStageRef.current;
    if (!scoreStage) {
      return;
    }

    const scrollDistance = scoreStage.scrollHeight - scoreStage.clientHeight;
    const nextProgress = clamp(progress, 0, 1);
    if (scrollDistance > 0) {
      scoreStage.scrollTo({
        top: scrollDistance * nextProgress,
        behavior: "auto"
      });
      return;
    }

    const rect = scoreStage.getBoundingClientRect();
    const stageTop = window.scrollY + rect.top;
    const pageDistance = Math.max(scoreStage.scrollHeight - window.innerHeight, 0);
    window.scrollTo({
      top: stageTop + pageDistance * nextProgress,
      behavior: "auto"
    });
  }, []);

  const seekAutoScroll = useCallback(
    (seconds: number) => {
      const nextElapsed = clamp(seconds, 0, autoScrollDurationSeconds);
      setAutoScrollElapsed(nextElapsed);
      scrollScoreToProgress(
        getAutoScrollProgress(
          nextElapsed,
          autoScrollDurationSeconds,
          autoScrollLeadInSeconds
        )
      );
    },
    [autoScrollDurationSeconds, autoScrollLeadInSeconds, scrollScoreToProgress]
  );

  const addItemAt = useCallback(
    (
      toolId: ToolId,
      x: number,
      y: number,
      labelOverride?: string,
      pageIndex = 0
    ) => {
      const tool = TOOL_BY_ID[toolId];
      const itemPageIndex = getItemPageIndex({ pageIndex } as SheetItem);
      const targetRowIndex =
        toolId === "chord" ? getRowIndexForPageY(itemPageIndex, y) : -1;
      const explicitLabel = labelOverride?.trim();
      const label =
        toolId === "diction"
          ? explicitLabel?.startsWith("活")
            ? explicitLabel
            : formatDictionMark(explicitLabel || dictionMark)
          : explicitLabel ||
            (toolId === "chord" ? quickChord.trim() || "C" : tool.label);
      const item: SheetItem = {
        id: createId(),
        toolId,
        label,
        x,
        y:
          toolId === "chord"
            ? getChordPlacementY(targetRowIndex, sheetLayoutMode)
            : tool.kind === "symbol"
              ? getSymbolSnapY(itemPageIndex, y)
              : y,
        pageIndex: itemPageIndex,
        size: tool.size,
        color: tool.color
      };

      setItems((current) => [...current, item]);
      setSelectedId(item.id);
      setStatus(`${tool.name}を追加`);
    },
    [dictionMark, quickChord, sheetLayoutMode]
  );

  const clearActiveTool = useCallback(() => {
    setActiveTool("");
    setStatus("記号選択を解除");
  }, []);

  const clearSelectionAndTool = useCallback(() => {
    setSelectedId("");
    setEditingItemId("");
    setActiveTool("");
    setStatus("選択を解除");
  }, []);

  const startInlineEdit = useCallback((itemId: string) => {
    setSelectedId(itemId);
    setActiveTool("");
    setDragging(null);
    setEditingItemId(itemId);
    setStatus("歌詞を編集中");
  }, []);

  const selectTool = useCallback(
    (toolId: ToolId) => {
      const shouldClear = activeTool === toolId;
      setSelectedId("");
      setEditingItemId("");
      setActiveTool(shouldClear ? "" : toolId);
      setStatus(
        shouldClear ? "記号選択を解除" : `${TOOL_BY_ID[toolId].name}を選択`
      );
    },
    [activeTool]
  );

  const hydrateDraft = useCallback((nextDraft: Partial<DraftData>) => {
    setMeta({ ...DEFAULT_META, ...(nextDraft.meta ?? {}) });
    setItems(
      Array.isArray(nextDraft.items) ? normalizeDraftItems(nextDraft.items) : []
    );
    setSourceLyrics(nextDraft.sourceLyrics ?? "");
    setReadingLyrics(nextDraft.readingLyrics ?? "");
    setReadingCorrections(nextDraft.readingCorrections ?? "");
    setVowelLyrics(nextDraft.vowelLyrics ?? "");
    setSections(normalizeSections(nextDraft.sections));
    setShowChords(nextDraft.showChords ?? true);
    setLyricDisplayMode(nextDraft.lyricDisplayMode ?? "original");
    setSheetLayoutMode(nextDraft.sheetLayoutMode ?? "lyricCard");
    setPinnedDictionMarks(
      Array.isArray(nextDraft.pinnedDictionMarks)
        ? nextDraft.pinnedDictionMarks
        : DEFAULT_PINNED_DICTION_MARKS
    );
    setAutoScrollSettings({
      ...DEFAULT_AUTO_SCROLL_SETTINGS,
      ...(nextDraft.autoScrollSettings ?? {})
    });
    setSunoText(nextDraft.sunoText ?? "");
    setMidiMeasuresPerRow(nextDraft.midiMeasuresPerRow ?? "4");
    setSharePayload("");
    setShareUrl("");
    setShareQrCode("");
    setIsAutoScrolling(false);
    setAutoScrollElapsed(0);
    setSelectedId("");
    setEditingItemId("");
    setSongLibrarySelectionId("");
  }, []);

  const saveDraft = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setStatus("保存しました");
  }, [draft]);

  const loadDraft = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setStatus("保存データなし");
      return;
    }

    hydrateDraft(JSON.parse(raw) as Partial<DraftData>);
    setStatus("復元しました");
  }, [hydrateDraft]);

  const persistSavedSongs = useCallback((songs: SavedSong[]) => {
    setSavedSongs(songs);
    localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(songs));
  }, []);

  const saveCurrentSongToLibrary = useCallback(() => {
    const title = meta.title.trim() || "無題の歌唱譜";
    const existingSong =
      savedSongs.find((song) => song.id === songLibrarySelectionId) ??
      savedSongs.find((song) => song.title === title);
    const songId = existingSong?.id ?? createId();
    const nextSong: SavedSong = {
      id: songId,
      title,
      vocalist: meta.vocalist.trim(),
      updatedAt: new Date().toISOString(),
      draft
    };
    const nextSongs = [
      nextSong,
      ...savedSongs.filter((song) => song.id !== songId)
    ].slice(0, 60);

    persistSavedSongs(nextSongs);
    setSongLibrarySelectionId(songId);
    setStatus(`${title}を曲保存しました`);
  }, [
    draft,
    meta.title,
    meta.vocalist,
    persistSavedSongs,
    savedSongs,
    songLibrarySelectionId
  ]);

  const loadSongFromLibrary = useCallback(
    (songId: string) => {
      const song = savedSongs.find((candidate) => candidate.id === songId);
      if (!song) {
        setStatus("読み込む曲を選んでください");
        return;
      }

      hydrateDraft(song.draft);
      setSongLibrarySelectionId(song.id);
      setStatus(`${song.title}を読み込みました`);
    },
    [hydrateDraft, savedSongs]
  );

  const deleteSongFromLibrary = useCallback(
    (songId: string) => {
      const song = savedSongs.find((candidate) => candidate.id === songId);
      if (!song) {
        return;
      }

      if (!window.confirm(`${song.title}を曲保存から削除しますか？`)) {
        return;
      }

      const nextSongs = savedSongs.filter((candidate) => candidate.id !== songId);
      persistSavedSongs(nextSongs);
      setSongLibrarySelectionId(nextSongs[0]?.id ?? "");
      setStatus(`${song.title}を削除しました`);
    },
    [persistSavedSongs, savedSongs]
  );

  const persistSavedLyrics = useCallback((lyrics: SavedLyric[]) => {
    setSavedLyrics(lyrics);
    localStorage.setItem(LYRIC_LIBRARY_STORAGE_KEY, JSON.stringify(lyrics));
  }, []);

  const saveCurrentLyricsToLibrary = useCallback(() => {
    if (
      !sourceLyrics.trim() &&
      !readingLyrics.trim() &&
      !vowelLyrics.trim()
    ) {
      setStatus("保存する歌詞がありません");
      return;
    }

    const title = getSavedLyricTitle(meta, sourceLyrics);
    const existingLyric =
      savedLyrics.find((lyric) => lyric.id === lyricLibrarySelectionId) ??
      savedLyrics.find((lyric) => lyric.title === title);
    const lyricId = existingLyric?.id ?? createId();
    const nextLyric: SavedLyric = {
      id: lyricId,
      title,
      updatedAt: new Date().toISOString(),
      sourceLyrics,
      readingLyrics,
      readingCorrections,
      vowelLyrics
    };
    const nextLyrics = [
      nextLyric,
      ...savedLyrics.filter((lyric) => lyric.id !== lyricId)
    ].slice(0, 120);

    persistSavedLyrics(nextLyrics);
    setLyricLibrarySelectionId(lyricId);
    setStatus(`${title}を歌詞保存しました`);
  }, [
    lyricLibrarySelectionId,
    meta,
    persistSavedLyrics,
    readingCorrections,
    readingLyrics,
    savedLyrics,
    sourceLyrics,
    vowelLyrics
  ]);

  const loadLyricsFromLibrary = useCallback(
    (lyricId: string) => {
      const lyric = savedLyrics.find((candidate) => candidate.id === lyricId);
      if (!lyric) {
        setStatus("読み込む歌詞を選んでください");
        return;
      }

      setSourceLyrics(lyric.sourceLyrics);
      setReadingLyrics(lyric.readingLyrics);
      setReadingCorrections(lyric.readingCorrections);
      setVowelLyrics(lyric.vowelLyrics);
      setLyricLibrarySelectionId(lyric.id);
      setStatus(`${lyric.title}の歌詞を読み込みました`);
    },
    [savedLyrics]
  );

  const deleteLyricsFromLibrary = useCallback(
    (lyricId: string) => {
      const lyric = savedLyrics.find((candidate) => candidate.id === lyricId);
      if (!lyric) {
        return;
      }

      if (!window.confirm(`${lyric.title}を歌詞保存から削除しますか？`)) {
        return;
      }

      const nextLyrics = savedLyrics.filter(
        (candidate) => candidate.id !== lyricId
      );
      persistSavedLyrics(nextLyrics);
      setLyricLibrarySelectionId(nextLyrics[0]?.id ?? "");
      setStatus(`${lyric.title}の歌詞を削除しました`);
    },
    [persistSavedLyrics, savedLyrics]
  );

  const updateItem = useCallback((id: string, patch: Partial<SheetItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const getEditableItemLabel = useCallback(
    (item: SheetItem) => {
      if (item.toolId !== "lyric") {
        return item.label;
      }

      // 表示モードに合わせて編集対象を返す
      // ひらがなモード → 読み（hiragana）を編集
      // 母音モード → 母音テキストを編集
      // 原文モード → 原文を編集
      if (lyricDisplayMode === "reading" || lyricDisplayMode === "vowel") {
        return getItemDisplayLabel(item);
      }

      return (
        item.originalLabel ??
        lyricDisplayFallbacks.get(item.id)?.original ??
        item.label
      );
    },
    [getItemDisplayLabel, lyricDisplayFallbacks, lyricDisplayMode]
  );

  const updateItemLabel = useCallback(
    (id: string, label: string) => {
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id) {
            return item;
          }

          if (item.toolId !== "lyric") {
            return { ...item, label };
          }

          // ひらがなモードで編集 → readingLabel だけ更新（原文はそのまま）
          if (lyricDisplayMode === "reading") {
            return {
              ...item,
              readingLabel: label,
              vowelLabel: toVowels(label)
            };
          }

          // 母音モードで編集 → vowelLabel だけ更新
          if (lyricDisplayMode === "vowel") {
            return { ...item, vowelLabel: label };
          }

          // 原文モードで編集 → 原文を更新してreadings再生成
          const readingLabel = roughHiragana(label, readingCorrectionEntries);
          return {
            ...item,
            label,
            originalLabel: label,
            readingLabel,
            vowelLabel: toVowels(readingLabel)
          };
        })
      );

      // ひらがなモードで編集した場合、左パネルの「読み」テキストも同期する
      if (lyricDisplayMode === "reading") {
        const sortedLyricItems = items
          .filter((item) => item.toolId === "lyric")
          .slice()
          .sort(
            (a, b) =>
              getItemGlobalRowIndex(a) - getItemGlobalRowIndex(b) || a.x - b.x
          );
        const itemIndex = sortedLyricItems.findIndex((item) => item.id === id);

        if (itemIndex >= 0) {
          setReadingLyrics((prev) =>
            updateReadingLyricsLine(prev, itemIndex, label)
          );
        }
      }
    },
    [items, lyricDisplayMode, readingCorrectionEntries]
  );

  const removeSelected = useCallback(() => {
    if (!selectedId) {
      return;
    }

    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId("");
    setEditingItemId("");
    setStatus("削除しました");
  }, [selectedId]);

  const requestReading = useCallback(async (text: string): Promise<ReadingResult> => {
    if (!text.trim()) {
      return { reading: "", source: "empty" };
    }

    if (!APP_BASE_PATH) {
      try {
        const response = await fetch("/api/reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, corrections: readingCorrections })
        });

        if (response.ok) {
          const data = (await response.json()) as Partial<ReadingResult>;
          if (data.reading?.trim()) {
            return {
              reading: data.reading,
              source: data.source ?? "kuromoji"
            };
          }
        }
      } catch {
        // Fall through to the browser-side converter.
      }
    }

    try {
      return {
        reading: await convertWithBrowserKuromoji(text, readingCorrections),
        source: "browser-kuromoji"
      };
    } catch {
      return {
        reading: roughHiragana(text, readingCorrectionEntries),
        source: "fallback"
      };
    }
  }, [readingCorrectionEntries, readingCorrections]);

  const convertTextToReadingPreservingSections = useCallback(
    async (text: string): Promise<ReadingResult> => {
      const blocks = parseSectionedLyrics(text);
      if (!blocks.length) {
        return requestReading(text);
      }

      const convertedBlocks = await Promise.all(
        blocks.map(async (block) => {
          const result = await requestReading(block.lines.join("\n"));
          return { ...result, label: block.label };
        })
      );

      return {
        reading: convertedBlocks
          .map((block) => `${block.label}\n${block.reading}`)
          .join("\n"),
        source: convertedBlocks.some((block) => block.source === "fallback")
          ? "fallback"
          : convertedBlocks.some((block) => block.source === "browser-kuromoji")
            ? "browser-kuromoji"
            : "kuromoji"
      };
    },
    [requestReading]
  );

  const buildVowelLyrics = useCallback(async () => {
    if (readingLyrics.trim()) {
      return convertSectionedTextToVowels(readingLyrics);
    }

    const result = await convertTextToReadingPreservingSections(sourceLyrics);
    return convertSectionedTextToVowels(result.reading);
  }, [convertTextToReadingPreservingSections, readingLyrics, sourceLyrics]);

  const placeTextOnSheet = useCallback(
    (
      text: string,
      toolId: Extract<ToolId, "lyric" | "vowel">,
      variants: LyricLineVariant[] = []
    ) => {
      const sectionBlocks = parseSectionedLyrics(text);
      const tool = TOOL_BY_ID[toolId];
      const placedItems: SheetItem[] = [];
      let variantIndex = 0;

      const createPlacedTextItem = (line: string, rowIndex: number): SheetItem => {
        const system = getSystemForRow(rowIndex);
        const variant = variants[variantIndex] ?? {};
        variantIndex += 1;
        const label = toolId === "lyric" ? variant.original ?? line : line;

        return {
          id: createId(),
          toolId,
          label,
          originalLabel: toolId === "lyric" ? label : undefined,
          readingLabel: toolId === "lyric" ? variant.reading : undefined,
          vowelLabel: toolId === "lyric" ? variant.vowel : undefined,
          x: LYRIC_LINE_X,
          y: getLyricPlacementY(system, toolId, sheetLayoutMode),
          pageIndex: getRowPageIndex(rowIndex),
          size: tool.size,
          color: tool.color,
          width: LYRIC_LINE_WIDTH,
          align: "left"
        };
      };

      if (sectionBlocks.length > 0) {
        const nextSections = createSectionsFromLyricBlocks(sectionBlocks, sections);
        setSections(nextSections);

        sectionBlocks.forEach((block, blockIndex) => {
          const section = nextSections[blockIndex];
          if (!section) {
            return;
          }

          const startRow = getSectionStartRow(section);
          const endRow = getSectionEndRow(section);
          block.lines.slice(0, endRow - startRow + 1).forEach((line, lineIndex) => {
            const rowIndex = startRow + lineIndex;
            placedItems.push(createPlacedTextItem(line, rowIndex));
          });
        });

        setItems((current) => [...current, ...placedItems]);
        setSelectedId(placedItems.at(-1)?.id ?? "");
        const totalLineCount = sectionBlocks.reduce(
          (sum, block) => sum + block.lines.length,
          0
        );
        const skippedLineCount = totalLineCount - placedItems.length;
        const pageCount = placedItems.reduce(
          (maxPage, item) => Math.max(maxPage, getItemPageIndex(item) + 1),
          1
        );
        setStatus(
          `${tool.name}をセクション別に${placedItems.length}行 / ${pageCount}ページ配置${
            skippedLineCount > 0 ? ` / 未配置${skippedLineCount}行` : ""
          }`
        );
        return;
      }

      const lines = splitLinesForPlacement(text);
      if (!lines.length) {
        setStatus("配置するテキストなし");
        return;
      }

      lines.slice(0, MAX_SHEET_ROWS).forEach((line, rowIndex) => {
        placedItems.push(createPlacedTextItem(line, rowIndex));
      });

      setItems((current) => [...current, ...placedItems]);
      setSelectedId(placedItems.at(-1)?.id ?? "");
      const skippedLineCount = lines.length - placedItems.length;
      const pageCount = placedItems.reduce(
        (maxPage, item) => Math.max(maxPage, getItemPageIndex(item) + 1),
        1
      );
      setStatus(
        `${tool.name}を${placedItems.length}行 / ${pageCount}ページ配置${
          skippedLineCount > 0 ? ` / 未配置${skippedLineCount}行` : ""
        }`
      );
    },
    [sections, sheetLayoutMode]
  );

  const placeLyricsOnSheet = useCallback(async () => {
    const placementSource = sourceLyrics.trim() ? sourceLyrics : readingLyrics;
    if (!placementSource.trim()) {
      setStatus("配置する歌詞なし");
      return;
    }

    setIsConverting(true);
    setStatus("歌詞配置の準備中");

    try {
      let nextReadingLyrics = readingLyrics;
      if (!nextReadingLyrics.trim()) {
        const result = await convertTextToReadingPreservingSections(placementSource);
        nextReadingLyrics = result.reading;
        setReadingLyrics(nextReadingLyrics);
      }

      let nextVowelLyrics = vowelLyrics;
      if (!nextVowelLyrics.trim()) {
        nextVowelLyrics = convertSectionedTextToVowels(nextReadingLyrics);
        setVowelLyrics(nextVowelLyrics);
      }

      const originalLines = flattenLyricLines(placementSource);
      const readingLines = flattenLyricLines(nextReadingLyrics);
      const vowelLines = flattenLyricLines(nextVowelLyrics);
      const variants = originalLines.map((original, index) => ({
        original,
        reading: readingLines[index],
        vowel: vowelLines[index]
      }));

      placeTextOnSheet(placementSource, "lyric", variants);
    } catch {
      const fallbackOriginalLines = flattenLyricLines(placementSource);
      const variants = fallbackOriginalLines.map((original) => {
        const reading = roughHiragana(original, readingCorrectionEntries);
        return {
          original,
          reading,
          vowel: toVowels(reading)
        };
      });
      placeTextOnSheet(placementSource, "lyric", variants);
    } finally {
      setIsConverting(false);
    }
  }, [
    convertTextToReadingPreservingSections,
    placeTextOnSheet,
    readingCorrectionEntries,
    readingLyrics,
    sourceLyrics,
    vowelLyrics
  ]);

  const convertToReading = useCallback(async () => {
    setIsConverting(true);
    setStatus("ひらがな変換中");

    try {
      const data = await convertTextToReadingPreservingSections(sourceLyrics);

      // 譜面上で手動修正済みの readingLabel を新しい変換結果にマージする
      // （手動修正した行はそのまま保持、未修正行は新しい変換結果を使う）
      const sortedLyricItems = items
        .filter((item) => item.toolId === "lyric")
        .slice()
        .sort(
          (a, b) =>
            getItemGlobalRowIndex(a) - getItemGlobalRowIndex(b) || a.x - b.x
        );

      let mergedReading = data.reading;
      sortedLyricItems.forEach((item, index) => {
        if (item.readingLabel != null) {
          mergedReading = updateReadingLyricsLine(
            mergedReading,
            index,
            item.readingLabel
          );
        }
      });

      setReadingLyrics(mergedReading);
      // readingLabel をクリアして readingLyrics を正とする
      setItems((current) =>
        current.map((item) =>
          item.toolId === "lyric"
            ? { ...item, readingLabel: undefined, vowelLabel: undefined }
            : item
        )
      );
      setStatus(
        data.source === "kuromoji" || data.source === "browser-kuromoji"
          ? "変換しました"
          : "簡易変換しました"
      );
    } catch {
      setReadingLyrics(roughHiragana(sourceLyrics, readingCorrectionEntries));
      setStatus("簡易変換しました");
    } finally {
      setIsConverting(false);
    }
  }, [convertTextToReadingPreservingSections, items, readingCorrectionEntries, sourceLyrics]);

  const convertReadingToVowels = useCallback(async () => {
    setIsConverting(true);
    setStatus("母音変換中");

    try {
      const nextVowelLyrics = await buildVowelLyrics();
      setVowelLyrics(nextVowelLyrics);
      setStatus("母音に変換しました");
    } catch {
      setVowelLyrics(toVowels(roughHiragana(sourceLyrics, readingCorrectionEntries)));
      setStatus("簡易母音変換しました");
    } finally {
      setIsConverting(false);
    }
  }, [buildVowelLyrics, readingCorrectionEntries, sourceLyrics]);

  const placeVowelsOnSheet = useCallback(async () => {
    if (vowelLyrics.trim()) {
      placeTextOnSheet(vowelLyrics, "vowel");
      return;
    }

    setIsConverting(true);
    setStatus("母音変換中");

    try {
      const nextVowelLyrics = await buildVowelLyrics();
      setVowelLyrics(nextVowelLyrics);
      placeTextOnSheet(nextVowelLyrics, "vowel");
    } catch {
      const fallbackVowels = toVowels(
        roughHiragana(sourceLyrics, readingCorrectionEntries)
      );
      setVowelLyrics(fallbackVowels);
      placeTextOnSheet(fallbackVowels, "vowel");
    } finally {
      setIsConverting(false);
    }
  }, [
    buildVowelLyrics,
    placeTextOnSheet,
    readingCorrectionEntries,
    sourceLyrics,
    vowelLyrics
  ]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vocal-sheet-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("JSONを書き出しました");
  }, [draft]);

  const importJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        hydrateDraft(JSON.parse(String(reader.result)) as Partial<DraftData>);
        setStatus("JSONを読み込みました");
      } catch {
        setStatus("JSONを読み込めませんでした");
      }
    };
    reader.readAsText(file);
  }, [hydrateDraft]);

  const resetSheet = useCallback(() => {
    if (!window.confirm("譜面を空にしますか？")) {
      return;
    }

    setItems([]);
    setSelectedId("");
    setEditingItemId("");
    setStatus("譜面を空にしました");
  }, []);

  const newDraft = useCallback(() => {
    if (!window.confirm("新しい譜面を作りますか？")) {
      return;
    }

    hydrateDraft({
      meta: DEFAULT_META,
      items: [],
      sourceLyrics: "",
      readingLyrics: "",
      readingCorrections: "",
      vowelLyrics: "",
      sections: DEFAULT_SECTIONS,
      showChords: true,
      lyricDisplayMode: "original",
      sheetLayoutMode: "lyricCard",
      pinnedDictionMarks: DEFAULT_PINNED_DICTION_MARKS,
      autoScrollSettings: DEFAULT_AUTO_SCROLL_SETTINGS,
      sunoText: "",
      midiMeasuresPerRow: "4"
    });
    setStatus("新規作成しました");
  }, [hydrateDraft]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        hydrateDraft(JSON.parse(raw) as Partial<DraftData>);
        setStatus("自動復元しました");
      } catch {
        setStatus("準備OK");
      }
    }
  }, [hydrateDraft]);

  useEffect(() => {
    const raw = localStorage.getItem(SONG_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const songs = JSON.parse(raw) as SavedSong[];
      if (Array.isArray(songs)) {
        setSavedSongs(
          songs
            .filter((song) => song?.id && song?.draft)
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )
        );
      }
    } catch {
      // Keep the app usable if old library data is malformed.
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(LYRIC_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const lyrics = JSON.parse(raw) as SavedLyric[];
      if (Array.isArray(lyrics)) {
        setSavedLyrics(
          lyrics
            .filter((lyric) => lyric?.id)
            .map((lyric) => ({
              id: lyric.id,
              title: lyric.title || "無題の歌詞",
              updatedAt: lyric.updatedAt || new Date(0).toISOString(),
              sourceLyrics: lyric.sourceLyrics ?? "",
              readingLyrics: lyric.readingLyrics ?? "",
              readingCorrections: lyric.readingCorrections ?? "",
              vowelLyrics: lyric.vowelLyrics ?? ""
            }))
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )
        );
      }
    } catch {
      // Keep the app usable if old lyric library data is malformed.
    }
  }, []);

  useEffect(() => {
    if (!window.location.hash.startsWith("#share=")) {
      return;
    }

    try {
      hydrateDraft(decodeShareData(decodeURIComponent(window.location.hash.slice(7))));
      setStatus("共有データを読み込みました");
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      setStatus("共有データを読み込めませんでした");
    }
  }, [hydrateDraft]);

  useEffect(() => {
    let isMounted = true;

    loadStoredAudio()
      .then((record) => {
        if (!isMounted || !record) {
          return;
        }

        replaceAudioSource(record.blob, record.name);
      })
      .catch(() => {
        if (isMounted) {
          setStatus("音源ストレージを確認できませんでした");
        }
      });

    return () => {
      isMounted = false;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = "";
      }
    };
  }, [replaceAudioSource]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const position = getPointerPositionForPage(
        event.clientX,
        event.clientY,
        dragging.pageIndex
      );
      updateItem(dragging.id, {
        x: clamp(position.x + dragging.offsetX, 3, 97),
        y: clamp(position.y + dragging.offsetY, 3, 97)
      });
    };

    const handlePointerUp = () => {
      setDragging(null);
      setStatus("配置を更新");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, getPointerPositionForPage, updateItem]);

  useEffect(() => {
    if (!isAutoScrolling) {
      return;
    }

    const usesAudio = autoScrollSettings.followAudio && Boolean(audioUrl);
    const startingElapsed = autoScrollElapsed;

    if (!usesAudio) {
      autoScrollStartTimeRef.current =
        performance.now() - startingElapsed * 1000;
    }

    const tick = (timestamp: number) => {
      const audioElement = audioRef.current;
      const nextElapsed =
        usesAudio && audioElement
          ? audioElement.currentTime
          : (timestamp - autoScrollStartTimeRef.current) / 1000;

      if (usesAudio && (!audioElement || audioElement.paused || audioElement.ended)) {
        setIsAutoScrolling(false);
        return;
      }

      const nextProgress = getAutoScrollProgress(
        nextElapsed,
        autoScrollDurationSeconds,
        autoScrollLeadInSeconds
      );

      setAutoScrollElapsed(nextElapsed);
      scrollScoreToProgress(nextProgress);

      if (nextProgress >= 1) {
        setIsAutoScrolling(false);
        return;
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [
    audioUrl,
    autoScrollDurationSeconds,
    autoScrollLeadInSeconds,
    autoScrollSettings.followAudio,
    isAutoScrolling,
    scrollScoreToProgress
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDraft();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        removeSelected();
        return;
      }

      if (selectedId && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        const amount = event.key === "]" ? 1 : -1;
        setItems((current) =>
          current.map((item) =>
            item.id === selectedId
              ? { ...item, size: clamp(item.size + amount, 10, 48) }
              : item
          )
        );
        return;
      }

      const match = SHEET_TOOLS.find(
        (tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase()
      );
      if (match) {
        event.preventDefault();
        setSelectedId("");
        setEditingItemId("");
        setActiveTool(match.id);
        setStatus(`${match.name}を選択`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removeSelected, saveDraft, selectedId]);

  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".sheet-item")) {
      return;
    }

    const pageIndex = Number(event.currentTarget.dataset.pageIndex ?? "0");

    if (!activeTool) {
      if (selectedId) {
        clearSelectionAndTool();
      }
      return;
    }

    if (event.pointerType === "touch") {
      const scoreStage = scoreStageRef.current;
      const pendingTap: PendingSheetTap = {
        pointerId: event.pointerId,
        toolId: activeTool,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: scoreStage?.scrollLeft ?? 0,
        startScrollTop: scoreStage?.scrollTop ?? 0
      };

      pendingSheetTapRef.current = pendingTap;

      const cleanup = () => {
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };

      const finishTap = (pointerEvent: PointerEvent) => {
        const currentTap = pendingSheetTapRef.current;
        pendingSheetTapRef.current = null;
        cleanup();

        if (!currentTap || pointerEvent.pointerId !== currentTap.pointerId) {
          return;
        }

        const latestScoreStage = scoreStageRef.current;
        const movedDistance = Math.hypot(
          pointerEvent.clientX - currentTap.startClientX,
          pointerEvent.clientY - currentTap.startClientY
        );
        const scrolledDistance = Math.hypot(
          (latestScoreStage?.scrollLeft ?? 0) - currentTap.startScrollLeft,
          (latestScoreStage?.scrollTop ?? 0) - currentTap.startScrollTop
        );

        if (movedDistance > 12 || scrolledDistance > 4) {
          return;
        }

        const tapPageElement = getScorePageElement(pageIndex);
        const positionOnPage = getPointerPositionInElement(
          pointerEvent.clientX,
          pointerEvent.clientY,
          tapPageElement
        );
        addItemAt(
          currentTap.toolId,
          positionOnPage.x,
          positionOnPage.y,
          undefined,
          pageIndex
        );
        setActiveTool("");
      };

      function handlePointerUp(pointerEvent: PointerEvent) {
        finishTap(pointerEvent);
      }

      function handlePointerCancel() {
        pendingSheetTapRef.current = null;
        cleanup();
      }

      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      return;
    }

    const position = getPointerPositionInElement(
      event.clientX,
      event.clientY,
      event.currentTarget
    );
    addItemAt(activeTool, position.x, position.y, undefined, pageIndex);
  };

  const handleItemPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: SheetItem
  ) => {
    event.stopPropagation();
    setSelectedId(item.id);
    setEditingItemId("");

    if (isSheetLyricItem(item)) {
      setActiveTool("");
      setDragging(null);
      return;
    }

    const pageIndex = getItemPageIndex(item);
    const position = getPointerPositionForPage(
      event.clientX,
      event.clientY,
      pageIndex
    );
    setDragging({
      id: item.id,
      pageIndex,
      offsetX: item.x - position.x,
      offsetY: item.y - position.y
    });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const value = event.dataTransfer.getData("application/x-vocal-tool");
    if (!isToolId(value)) {
      return;
    }

    const pageIndex = Number(event.currentTarget.dataset.pageIndex ?? "0");
    const position = getPointerPositionInElement(
      event.clientX,
      event.clientY,
      event.currentTarget
    );
    addItemAt(value, position.x, position.y, undefined, pageIndex);
  };

  const addChordName = (chordName: string) => {
    const label = chordName.trim() || "C";
    const targetRowIndex =
      selectedItemRowIndex >= 0 ? selectedItemRowIndex : 0;
    const rowLyricItems = items
      .filter(
        (item) =>
          isSheetLyricItem(item) &&
          getItemGlobalRowIndex(item) === targetRowIndex
      )
      .slice()
      .sort((a, b) => a.x - b.x);
    const chordIndex =
      items.filter(
        (item) =>
          item.toolId === "chord" &&
          getItemGlobalRowIndex(item) === targetRowIndex
      ).length % 4;
    const targetX =
      selectedItem && isSheetLyricItem(selectedItem)
        ? selectedItem.x
        : selectedItem?.toolId === "chord"
          ? selectedItem.x
          : rowLyricItems[0]?.x ?? 14 + chordIndex * 18;

    addItemAt(
      "chord",
      clamp(targetX, 8, 92),
      getChordPlacementY(targetRowIndex, sheetLayoutMode),
      label,
      getRowPageIndex(targetRowIndex)
    );
    setActiveTool("");
  };

  const addQuickChord = () => {
    addChordName(quickChord);
  };

  const importParsedMidi = (parsedMidi: ParsedMidi) => {
    const measuresPerRow = parsePositiveNumber(midiMeasuresPerRow, 4);
    const beatsPerMeasure = parsedMidi.timeSignature.numerator || 4;
    const denominator = parsedMidi.timeSignature.denominator || 4;
    const ticksPerMeasure =
      parsedMidi.ppq * beatsPerMeasure * (4 / denominator);
    const noteTool = TOOL_BY_ID.note;
    const chordTool = TOOL_BY_ID.chord;
    const nextItems: SheetItem[] = [];
    const ignoredNotes = { count: 0 };

    parsedMidi.notes.slice(0, 420).forEach((note) => {
      const measurePosition = note.startTick / ticksPerMeasure;
      const rowIndex = Math.floor(measurePosition / measuresPerRow);
      const system = getSystemForRow(rowIndex);

      if (rowIndex >= MAX_SHEET_ROWS) {
        ignoredNotes.count += 1;
        return;
      }

      const positionInRow = measurePosition - rowIndex * measuresPerRow;
      nextItems.push({
        id: createId(),
        toolId: "note",
        label: midiPitchName(note.pitch),
        x: clamp(10 + (80 * positionInRow) / measuresPerRow, 8, 92),
        y: midiPitchToStaffY(note.pitch, rowIndex),
        pageIndex: getRowPageIndex(rowIndex),
        size: noteTool.size,
        color: noteTool.color,
        pitch: note.pitch,
        durationTicks: note.endTick - note.startTick
      });
    });

    const chordGrid = Math.max(1, Math.round(parsedMidi.ppq / 4));
    const groupedNotes = new Map<number, ParsedMidiNote[]>();
    parsedMidi.notes.forEach((note) => {
      const gridTick = Math.round(note.startTick / chordGrid) * chordGrid;
      groupedNotes.set(gridTick, [...(groupedNotes.get(gridTick) ?? []), note]);
    });

    const seenChordSlots = new Set<string>();
    [...groupedNotes.entries()]
      .sort(([tickA], [tickB]) => tickA - tickB)
      .forEach(([gridTick, notesInSlot]) => {
        const uniquePitches = [...new Set(notesInSlot.map((note) => note.pitch))];
        const chordName = detectChordName(uniquePitches);
        if (!chordName) {
          return;
        }

        const measurePosition = gridTick / ticksPerMeasure;
        const rowIndex = Math.floor(measurePosition / measuresPerRow);
        if (rowIndex >= MAX_SHEET_ROWS) {
          return;
        }

        const beatInMeasure = Math.floor(
          ((measurePosition % 1) * beatsPerMeasure) + 0.0001
        );
        const chordSlot = `${rowIndex}:${Math.floor(measurePosition)}:${beatInMeasure}`;
        if (seenChordSlots.has(chordSlot)) {
          return;
        }
        seenChordSlots.add(chordSlot);

        const positionInRow = measurePosition - rowIndex * measuresPerRow;
        nextItems.push({
          id: createId(),
          toolId: "chord",
          label: chordName,
          x: clamp(10 + (80 * positionInRow) / measuresPerRow, 8, 92),
          y: getChordPlacementY(rowIndex, sheetLayoutMode),
          pageIndex: getRowPageIndex(rowIndex),
          size: chordTool.size,
          color: chordTool.color
        });
      });

    setItems((current) => [...current, ...nextItems]);
    setSheetLayoutMode("staff");
    setSelectedId(nextItems.at(-1)?.id ?? "");
    setMidiStatus(
      `${parsedMidi.name || "MIDI"}: 音符${nextItems.filter((item) => item.toolId === "note").length} / コード${nextItems.filter((item) => item.toolId === "chord").length}${
        ignoredNotes.count ? ` / 範囲外${ignoredNotes.count}` : ""
      }`
    );
    setStatus("MIDIを5線譜へ配置しました");
  };

  const importMidiFile = async (file: File) => {
    try {
      const parsedMidi = parseMidiFile(await file.arrayBuffer());
      importParsedMidi(parsedMidi);
    } catch (error) {
      setMidiStatus(error instanceof Error ? error.message : "MIDIを読めませんでした");
      setStatus("MIDIを読めませんでした");
    }
  };

  const addLiveMidiNote = useCallback((pitch: number) => {
    const noteTool = TOOL_BY_ID.note;

    setItems((current) => {
      const noteCount = current.filter((item) => item.toolId === "note").length;
      const rowIndex = Math.floor(noteCount / 16) % MAX_SHEET_ROWS;
      const positionInRow = noteCount % 16;
      const noteItem: SheetItem = {
        id: createId(),
        toolId: "note",
        label: midiPitchName(pitch),
        x: 10 + positionInRow * 5.2,
        y: midiPitchToStaffY(pitch, rowIndex),
        pageIndex: getRowPageIndex(rowIndex),
        size: noteTool.size,
        color: noteTool.color,
        pitch
      };

      setSelectedId(noteItem.id);
      setSheetLayoutMode("staff");
      setMidiStatus(`Web MIDI: ${midiPitchName(pitch)} を受信`);
      return [...current, noteItem];
    });
  }, []);

  const connectMidiDevices = async () => {
    const requestMIDIAccess = (
      navigator as Navigator & {
        requestMIDIAccess?: () => Promise<MidiAccessLike>;
      }
    ).requestMIDIAccess;

    if (!requestMIDIAccess) {
      setMidiStatus("このブラウザはWeb MIDIに未対応です");
      return;
    }

    try {
      const access = await requestMIDIAccess();
      midiAccessRef.current = access;
      const inputs = Array.from(access.inputs.values());

      inputs.forEach((input) => {
        input.onmidimessage = (event) => {
          const [statusByte = 0, pitch = 0, velocity = 0] = Array.from(
            event.data ?? []
          );
          const eventType = statusByte & 0xf0;
          if (eventType === 0x90 && velocity > 0) {
            addLiveMidiNote(pitch);
          }
        };
      });

      setMidiStatus(
        inputs.length
          ? `${inputs.length}個のMIDI入力に接続しました`
          : "MIDI入力が見つかりません"
      );
    } catch {
      setMidiStatus("MIDI機器に接続できませんでした");
    }
  };

  const handleAudioUpload = async (file: File) => {
    try {
      await saveStoredAudio(file);
      replaceAudioSource(file, file.name);
      setStatus("音源を登録しました");
    } catch {
      setStatus("音源を登録できませんでした");
    }
  };

  const playAudio = async () => {
    if (!audioRef.current || !audioUrl) {
      setStatus("音源を登録してください");
      return;
    }

    try {
      await audioRef.current.play();
      setIsAudioPlaying(true);
      setStatus("再生中");
    } catch {
      setStatus("再生できませんでした");
    }
  };

  const pauseAudio = () => {
    audioRef.current?.pause();
    setIsAudioPlaying(false);
    setStatus("一時停止");
  };

  const stopAudio = () => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setAudioCurrentTime(0);
    setIsAudioPlaying(false);
    setStatus("停止しました");
  };

  const skipAudio = (seconds: number) => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.currentTime = clamp(
      audioRef.current.currentTime + seconds,
      0,
      audioDuration || audioRef.current.duration || 0
    );
  };

  const seekAudio = (seconds: number) => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.currentTime = seconds;
    setAudioCurrentTime(seconds);
  };

  const startAutoScroll = async () => {
    if (autoScrollElapsed >= autoScrollDurationSeconds) {
      seekAutoScroll(0);
    }

    if (autoScrollSettings.followAudio && audioUrl) {
      await playAudio();
    }

    setIsAutoScrolling(true);
    setStatus("自動スクロール中");
  };

  const pauseAutoScroll = () => {
    setIsAutoScrolling(false);

    if (autoScrollSettings.followAudio && audioUrl) {
      pauseAudio();
      return;
    }

    setStatus("自動スクロールを一時停止");
  };

  const stopAutoScroll = () => {
    setIsAutoScrolling(false);
    setAutoScrollElapsed(0);
    scrollScoreToProgress(0);

    if (autoScrollSettings.followAudio && audioUrl) {
      stopAudio();
      return;
    }

    setStatus("自動スクロールを停止");
  };

  const clearAudio = async () => {
    try {
      await deleteStoredAudio();
    } catch {
      // The UI can still clear the current session even if persistent storage fails.
    }

    audioRef.current?.pause();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
    setAudioUrl("");
    setAudioName("");
    setAudioDuration(0);
    setAudioCurrentTime(0);
    setIsAudioPlaying(false);
    setStatus("音源を解除しました");
  };

  const upsertSection = () => {
    const trimmedName = sectionName.trim();
    if (!trimmedName) {
      setStatus("セクション名を入力してください");
      return;
    }

    setSections((current) => {
      const normalizedCurrent = normalizeSections(current);
      const startRow = Math.min(sectionStartRow, sectionEndRow);
      const endRow = Math.max(sectionStartRow, sectionEndRow);
      const existing = normalizedCurrent.find(
        (section) => getSectionStartRow(section) === startRow
      );
      const color =
        existing?.color ??
        SECTION_COLORS[normalizedCurrent.length % SECTION_COLORS.length];
      const nextSection: SectionEntry = {
        id: existing?.id ?? createId(),
        name: trimmedName,
        rowIndex: startRow,
        startRow,
        endRow,
        order: existing?.order ?? normalizedCurrent.length,
        startMeasure: sectionStartMeasure.trim(),
        recordingStartMeasure: sectionRecordingStartMeasure.trim(),
        color
      };

      return normalizeSections([
        ...normalizedCurrent.filter(
          (section) => getSectionStartRow(section) !== startRow
        ),
        nextSection
      ]);
    });
    setStatus(`${trimmedName}を設定`);
  };

  const updateRowSectionName = (rowIndex: number, nextName: string) => {
    const trimmedName = nextName.trim();
    if (rowIndex < 0 || !trimmedName) {
      return;
    }

    setSections((current) => {
      const normalizedCurrent = normalizeSections(current);
      const existingExact = normalizedCurrent.find(
        (section) =>
          getSectionStartRow(section) === rowIndex &&
          getSectionEndRow(section) === rowIndex
      );
      const coveringSection = normalizedCurrent.find(
        (section) =>
          rowIndex >= getSectionStartRow(section) &&
          rowIndex <= getSectionEndRow(section)
      );
      const color =
        existingExact?.color ??
        coveringSection?.color ??
        SECTION_COLORS[normalizedCurrent.length % SECTION_COLORS.length];
      const nextSection: SectionEntry = {
        id: existingExact?.id ?? createId(),
        name: trimmedName,
        rowIndex,
        startRow: rowIndex,
        endRow: rowIndex,
        order: existingExact?.order ?? normalizedCurrent.length,
        startMeasure:
          existingExact?.startMeasure ?? coveringSection?.startMeasure ?? "",
        recordingStartMeasure:
          existingExact?.recordingStartMeasure ??
          coveringSection?.recordingStartMeasure ??
          "",
        color
      };

      return normalizeSections([
        ...normalizedCurrent.filter((section) => section.id !== existingExact?.id),
        nextSection
      ]);
    });
    setStatus(`この段を${trimmedName}に変更しました`);
  };

  const removeSection = (sectionId: string) => {
    setSections((current) =>
      normalizeSections(current)
        .filter((section) => section.id !== sectionId)
        .map((section, index) => ({ ...section, order: index }))
    );
    setStatus("セクションを外しました");
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setSections((current) => {
      const ordered = normalizeSections(current);
      const currentIndex = ordered.findIndex((section) => section.id === sectionId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
        return ordered;
      }

      const next = [...ordered];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next.map((section, index) => ({ ...section, order: index }));
    });
    setStatus("録音順を更新しました");
  };

  const fillSectionForm = (section: SectionEntry) => {
    setSectionName(section.name);
    setSectionStartRow(getSectionStartRow(section));
    setSectionEndRow(getSectionEndRow(section));
    setSectionStartMeasure(section.startMeasure ?? "");
    setSectionRecordingStartMeasure(section.recordingStartMeasure ?? "");
  };

  const toggleDictionPin = (value: string) => {
    setPinnedDictionMarks((current) =>
      current.includes(value)
        ? current.filter((mark) => mark !== value)
        : [...current, value]
    );
  };

  const createShareSnapshot = () => {
    const payload = encodeShareData(draft);
    const url = `${window.location.origin}${window.location.pathname}#share=${encodeURIComponent(
      payload
    )}`;
    setSharePayload(payload);
    setShareUrl(url);
    setShareQrCode("");

    return { payload, url };
  };

  const createSharePayload = async () => {
    try {
      const { payload } = createShareSnapshot();
      await navigator.clipboard?.writeText(payload);
      setStatus("共有コードをコピーしました");
    } catch {
      setStatus("共有コードを作れませんでした");
    }
  };

  const createShareUrl = async () => {
    try {
      const { url } = createShareSnapshot();

      if (navigator.share) {
        await navigator.share({ title: meta.title, text: url, url });
      } else {
        await navigator.clipboard?.writeText(url);
      }

      setStatus("共有リンクを用意しました");
    } catch {
      setStatus("共有リンクを作れませんでした");
    }
  };

  const createShareQrCode = async () => {
    try {
      const { url } = createShareSnapshot();
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220,
        color: {
          dark: "#0f172a",
          light: "#ffffff"
        }
      });
      setShareQrCode(dataUrl);
      setStatus("QRコードを作成しました");
    } catch {
      setStatus(
        "QRコードを作れませんでした。リンクが長い場合は共有コードを使ってください"
      );
    }
  };

  const importSharePayload = () => {
    try {
      hydrateDraft(decodeShareData(sharePayload));
      setStatus("共有コードを読み込みました");
    } catch {
      setStatus("共有コードを読み込めませんでした");
    }
  };

  const createSunoText = () => {
    const lyricItems = items.filter((item) => item.toolId === "lyric");
    const sectionsForSuno =
      normalizedSections.length > 0
        ? normalizedSections
        : [
            {
              id: "suno-default",
              name: "Aメロ1",
              rowIndex: 0,
              startRow: 0,
              endRow: sheetPageCount * ROWS_PER_PAGE - 1,
              color: SECTION_COLORS[0]
            } satisfies SectionEntry
          ];

    const getLyricsForSection = (section: SectionEntry) => {
      const startRow = getSectionStartRow(section);
      const endRow = getSectionEndRow(section);
      const rows = new Map<number, SheetItem[]>();

      lyricItems.forEach((item) => {
        const rowIndex = getItemGlobalRowIndex(item);
        if (rowIndex < startRow || rowIndex > endRow) {
          return;
        }

        rows.set(rowIndex, [...(rows.get(rowIndex) ?? []), item]);
      });

      return [...rows.entries()]
        .sort(([rowA], [rowB]) => rowA - rowB)
        .map(([, rowItems]) =>
          rowItems
            .slice()
            .sort((a, b) => a.x - b.x)
            .map((item) => getEditableItemLabel(item))
            .join(" ")
            .trim()
        )
        .filter(Boolean)
        .join("\n");
    };

    const nextSunoText = sectionsForSuno
      .map((section, index) => {
        const tag = getSunoMetaTag(section.name);
        const sectionLyrics = lyricItems.length
          ? getLyricsForSection(section)
          : index === 0
            ? sourceLyrics.trim()
            : "";

        return [tag, sectionLyrics].filter(Boolean).join("\n");
      })
      .join("\n\n");

    setSunoText(nextSunoText);
    setStatus("Sunoタグへ変換しました");
    return nextSunoText;
  };

  const copySunoText = async () => {
    try {
      const text = sunoText || createSunoText();
      if (!text) {
        setStatus("コピーするSuno用テキストなし");
        return;
      }

      await navigator.clipboard?.writeText(text);
      setStatus("Suno用テキストをコピーしました");
    } catch {
      setStatus("Suno用テキストをコピーできませんでした");
    }
  };

  const updateMeta = (key: keyof SheetMeta, value: string) => {
    setMeta((current) => ({ ...current, [key]: value }));
  };

  return (
    <main
      className={`app-shell ${
        selectedItem || activeToolSpec ? "has-mobile-selection" : ""
      }`}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Music2 size={24} />
          </span>
          <div>
            <h1>歌唱譜メーカー</h1>
            <p>{status}</p>
          </div>
        </div>

        <div className="top-actions" aria-label="ファイル操作">
          <button type="button" className="icon-button" onClick={newDraft} title="新規">
            <Plus size={18} />
            <span>新規</span>
          </button>
          <button type="button" className="icon-button" onClick={saveDraft} title="保存">
            <Save size={18} />
            <span>保存</span>
          </button>
          <button type="button" className="icon-button" onClick={loadDraft} title="復元">
            <FolderOpen size={18} />
            <span>復元</span>
          </button>
          <button type="button" className="icon-button" onClick={exportJson} title="JSON">
            <Download size={18} />
            <span>JSON</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => fileInputRef.current?.click()}
            title="読み込み"
          >
            <Upload size={18} />
            <span>読込</span>
          </button>
          <button
            type="button"
            className="icon-button primary"
            onClick={() => window.print()}
            title="印刷"
          >
            <Printer size={18} />
            <span>印刷</span>
          </button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                importJson(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="workspace">
        <aside className="side-panel left-panel">
          <section className="panel-section lyric-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("lyrics")}
              aria-expanded={!collapsedPanels.lyrics}
            >
              <Wand2 size={18} />
              <span>歌詞</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.lyrics ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.lyrics && (
              <>
                <label className="field-label" htmlFor="lyricLibrarySelect">
                  保存した歌詞
                </label>
                <select
                  id="lyricLibrarySelect"
                  value={lyricLibrarySelectionId}
                  onChange={(event) => setLyricLibrarySelectionId(event.target.value)}
                >
                  <option value="">歌詞を選択</option>
                  {savedLyrics.map((lyric) => (
                    <option key={lyric.id} value={lyric.id}>
                      {lyric.title}
                    </option>
                  ))}
                </select>
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={saveCurrentLyricsToLibrary}
                  >
                    <Save size={16} />
                    <span>保存</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => loadLyricsFromLibrary(lyricLibrarySelectionId)}
                    disabled={!lyricLibrarySelectionId}
                  >
                    <FolderOpen size={16} />
                    <span>読込</span>
                  </button>
                  <button
                    type="button"
                    className="control-button danger"
                    onClick={() => deleteLyricsFromLibrary(lyricLibrarySelectionId)}
                    disabled={!lyricLibrarySelectionId}
                  >
                    <Trash2 size={16} />
                    <span>削除</span>
                  </button>
                </div>
                <p className="song-library-status">
                  {savedLyrics.length > 0
                    ? `${savedLyrics.length}件保存済み${
                        savedLyrics[0]?.updatedAt
                          ? ` / 最新 ${formatSavedSongDate(savedLyrics[0].updatedAt)}`
                          : ""
                      }`
                    : "まだ保存した歌詞はありません"}
                </p>

                <label className="field-label" htmlFor="sourceLyrics">
                  原文
                </label>
                <textarea
                  id="sourceLyrics"
                  className="lyrics-textarea source-lyrics-textarea"
                  value={sourceLyrics}
                  onChange={(event) => setSourceLyrics(event.target.value)}
                  rows={8}
                />
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={convertToReading}
                    disabled={isConverting}
                  >
                    <Type size={16} />
                    <span>{isConverting ? "変換中" : "ひらがな"}</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void convertReadingToVowels()}
                    disabled={isConverting}
                  >
                    <FileJson size={16} />
                    <span>{isConverting ? "変換中" : "母音"}</span>
                  </button>
                </div>

                <label className="field-label" htmlFor="readingCorrections">
                  読み補正
                </label>
                <textarea
                  id="readingCorrections"
                  className="lyrics-textarea compact-lyrics-textarea"
                  value={readingCorrections}
                  onChange={(event) => setReadingCorrections(event.target.value)}
                  rows={3}
                  placeholder={"踵=きびす\n大人=こ\n映える=ばえる"}
                />

                <label className="field-label" htmlFor="readingLyrics">
                  読み
                </label>
                <textarea
                  id="readingLyrics"
                  className="lyrics-textarea reading-lyrics-textarea"
                  value={readingLyrics}
                  onChange={(event) => setReadingLyrics(event.target.value)}
                  rows={12}
                />
                <button
                  type="button"
                  className="wide-button"
                  onClick={() => void placeLyricsOnSheet()}
                  disabled={isConverting}
                >
                  <Plus size={16} />
                  <span>歌詞を配置</span>
                </button>

                <label className="field-label" htmlFor="vowelLyrics">
                  母音
                </label>
                <textarea
                  id="vowelLyrics"
                  className="lyrics-textarea compact-lyrics-textarea"
                  value={vowelLyrics}
                  onChange={(event) => setVowelLyrics(event.target.value)}
                  rows={5}
                />
                <button
                  type="button"
                  className="wide-button"
                  onClick={() => void placeVowelsOnSheet()}
                  disabled={isConverting}
                >
                  <Plus size={16} />
                  <span>母音を配置</span>
                </button>
              </>
            )}
          </section>

          <section className="panel-section song-library-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("library")}
              aria-expanded={!collapsedPanels.library}
            >
              <Save size={18} />
              <span>曲保存</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.library ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.library && (
              <>
                <button
                  type="button"
                  className="wide-button"
                  onClick={saveCurrentSongToLibrary}
                >
                  <Save size={16} />
                  <span>この曲を保存</span>
                </button>
                <label className="field-label" htmlFor="songLibrarySelect">
                  保存済み
                </label>
                <select
                  id="songLibrarySelect"
                  value={songLibrarySelectionId}
                  onChange={(event) => setSongLibrarySelectionId(event.target.value)}
                >
                  <option value="">曲を選択</option>
                  {savedSongs.map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title}
                      {song.vocalist ? ` / ${song.vocalist}` : ""}
                    </option>
                  ))}
                </select>
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => loadSongFromLibrary(songLibrarySelectionId)}
                    disabled={!songLibrarySelectionId}
                  >
                    <FolderOpen size={16} />
                    <span>読込</span>
                  </button>
                  <button
                    type="button"
                    className="control-button danger"
                    onClick={() => deleteSongFromLibrary(songLibrarySelectionId)}
                    disabled={!songLibrarySelectionId}
                  >
                    <Trash2 size={16} />
                    <span>削除</span>
                  </button>
                </div>
                <p className="song-library-status">
                  {savedSongs.length > 0
                    ? `${savedSongs.length}曲保存済み${
                        savedSongs[0]?.updatedAt
                          ? ` / 最新 ${formatSavedSongDate(savedSongs[0].updatedAt)}`
                          : ""
                      }`
                    : "まだ曲保存はありません"}
                </p>
              </>
            )}
          </section>

          <section className="panel-section suno-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("suno")}
              aria-expanded={!collapsedPanels.suno}
            >
              <Wand2 size={18} />
              <span>Suno</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.suno ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.suno && (
              <>
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={createSunoText}
                  >
                    <FileJson size={16} />
                    <span>変換</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void copySunoText()}
                  >
                    <Copy size={16} />
                    <span>コピー</span>
                  </button>
                </div>
                <label className="field-label" htmlFor="sunoText">
                  Suno用テキスト
                </label>
                <textarea
                  id="sunoText"
                  value={sunoText}
                  onChange={(event) => setSunoText(event.target.value)}
                  rows={8}
                />
              </>
            )}
          </section>

          <section className="panel-section midi-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("midi")}
              aria-expanded={!collapsedPanels.midi}
            >
              <Music2 size={18} />
              <span>MIDI / DAW</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.midi ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.midi && (
              <>
                <input
                  ref={midiInputRef}
                  className="sr-only"
                  type="file"
                  accept=".mid,.midi,audio/midi,audio/x-midi"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void importMidiFile(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <label className="field-label" htmlFor="midiMeasuresPerRow">
                  MIDI 1段小節
                </label>
                <input
                  id="midiMeasuresPerRow"
                  type="number"
                  min={1}
                  value={midiMeasuresPerRow}
                  onChange={(event) => setMidiMeasuresPerRow(event.target.value)}
                />
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => midiInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    <span>MIDI読込</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void connectMidiDevices()}
                  >
                    <Keyboard size={16} />
                    <span>機器接続</span>
                  </button>
                </div>
                <p className="midi-status">{midiStatus}</p>
              </>
            )}
          </section>

          <section className="panel-section audio-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("audio")}
              aria-expanded={!collapsedPanels.audio}
            >
              <Music2 size={18} />
              <span>音源</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.audio ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.audio && (
              <>
                <input
                  ref={audioInputRef}
                  className="sr-only"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleAudioUpload(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  className="wide-button neutral"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>音源を登録</span>
                </button>
                <p className="audio-file-name">{audioName || "未登録"}</p>
                <audio
                  ref={audioRef}
                  src={audioUrl || undefined}
                  onLoadedMetadata={(event) =>
                    setAudioDuration(event.currentTarget.duration || 0)
                  }
                  onTimeUpdate={(event) =>
                    setAudioCurrentTime(event.currentTarget.currentTime)
                  }
                  onEnded={() => setIsAudioPlaying(false)}
                />
                <div className="audio-controls" aria-label="音源操作">
                  <button type="button" onClick={() => skipAudio(-5)} title="戻る">
                    <SkipBack size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={isAudioPlaying ? pauseAudio : playAudio}
                    title={isAudioPlaying ? "一時停止" : "再生"}
                  >
                    {isAudioPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button type="button" onClick={stopAudio} title="停止">
                    <Square size={15} />
                  </button>
                  <button type="button" onClick={() => skipAudio(5)} title="進む">
                    <SkipForward size={16} />
                  </button>
                </div>
                <input
                  className="audio-slider"
                  type="range"
                  min={0}
                  max={audioDuration || 0}
                  step={0.1}
                  value={Math.min(audioCurrentTime, audioDuration || 0)}
                  onChange={(event) => seekAudio(Number(event.target.value))}
                  aria-label="再生位置"
                />
                <div className="audio-time">
                  <span>{formatTime(audioCurrentTime)}</span>
                  <span>{formatTime(audioDuration)}</span>
                </div>
                <button
                  type="button"
                  className="wide-button neutral"
                  onClick={() => void clearAudio()}
                  disabled={!audioUrl}
                >
                  <Eraser size={16} />
                  <span>音源を解除</span>
                </button>
              </>
            )}
          </section>

          <section className="panel-section auto-scroll-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("scroll")}
              aria-expanded={!collapsedPanels.scroll}
            >
              <Timer size={18} />
              <span>自動スクロール</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.scroll ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.scroll && (
              <>
                <div className="segmented-control scroll-mode-control">
                  {[
                    ["bpm", "BPM"],
                    ["seconds", "秒数"]
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={
                        autoScrollSettings.mode === mode ? "active" : ""
                      }
                      onClick={() =>
                        updateAutoScrollSetting("mode", mode as AutoScrollMode)
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="toggle-control scroll-audio-toggle">
                  <input
                    type="checkbox"
                    checked={autoScrollSettings.followAudio}
                    onChange={(event) =>
                      updateAutoScrollSetting("followAudio", event.target.checked)
                    }
                  />
                  <span>音源追従</span>
                </label>

                {autoScrollSettings.mode === "seconds" ? (
                  <>
                    <label className="field-label" htmlFor="scrollSeconds">
                      全体秒数
                    </label>
                    <input
                      id="scrollSeconds"
                      type="number"
                      min={1}
                      value={autoScrollSettings.durationSeconds}
                      onChange={(event) =>
                        updateAutoScrollSetting(
                          "durationSeconds",
                          event.target.value
                        )
                      }
                    />
                  </>
                ) : (
                  <div className="scroll-setting-grid">
                    <label>
                      <span>拍子</span>
                      <input
                        type="number"
                        min={1}
                        value={autoScrollSettings.beatsPerMeasure}
                        onChange={(event) =>
                          updateAutoScrollSetting(
                            "beatsPerMeasure",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>1段小節</span>
                      <input
                        type="number"
                        min={1}
                        value={autoScrollSettings.measuresPerRow}
                        onChange={(event) =>
                          updateAutoScrollSetting(
                            "measuresPerRow",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>
                )}

                <label className="field-label" htmlFor="leadInSeconds">
                  前カウント
                </label>
                <input
                  id="leadInSeconds"
                  type="number"
                  min={0}
                  value={autoScrollSettings.leadInSeconds}
                  onChange={(event) =>
                    updateAutoScrollSetting("leadInSeconds", event.target.value)
                  }
                />

                <input
                  className="scroll-slider"
                  type="range"
                  min={0}
                  max={autoScrollDurationSeconds}
                  step={0.1}
                  value={Math.min(autoScrollElapsed, autoScrollDurationSeconds)}
                  onChange={(event) => seekAutoScroll(Number(event.target.value))}
                  aria-label="自動スクロール位置"
                />
                <div className="audio-time">
                  <span>{formatTime(autoScrollElapsed)}</span>
                  <span>{formatTime(autoScrollDurationSeconds)}</span>
                </div>
                <div className="audio-controls" aria-label="自動スクロール操作">
                  <button
                    type="button"
                    onClick={() => seekAutoScroll(autoScrollElapsed - 5)}
                    title="戻る"
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={
                      isAutoScrolling
                        ? pauseAutoScroll
                        : () => void startAutoScroll()
                    }
                    title={isAutoScrolling ? "一時停止" : "開始"}
                  >
                    {isAutoScrolling ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button type="button" onClick={stopAutoScroll} title="停止">
                    <Square size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => seekAutoScroll(autoScrollElapsed + 5)}
                    title="進む"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="panel-section share-panel">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("share")}
              aria-expanded={!collapsedPanels.share}
            >
              <Share2 size={18} />
              <span>共有</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.share ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.share && (
              <>
                <div className="button-row">
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void createSharePayload()}
                  >
                    <Copy size={16} />
                    <span>コード</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void createShareUrl()}
                  >
                    <Share2 size={16} />
                    <span>リンク</span>
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => void createShareQrCode()}
                  >
                    <QrCode size={16} />
                    <span>QR</span>
                  </button>
                </div>
                {shareUrl && (
                  <>
                    <label className="field-label" htmlFor="shareUrl">
                      共有リンク
                    </label>
                    <input
                      id="shareUrl"
                      value={shareUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </>
                )}
                {shareQrCode && (
                  <div className="qr-share-box">
                    <img src={shareQrCode} alt="共有リンクのQRコード" />
                    <span>スマホで読み取って共有リンクを開けます</span>
                  </div>
                )}
                <label className="field-label" htmlFor="sharePayload">
                  共有コード
                </label>
                <textarea
                  id="sharePayload"
                  value={sharePayload}
                  onChange={(event) => setSharePayload(event.target.value)}
                  rows={4}
                />
                <button
                  type="button"
                  className="wide-button neutral"
                  onClick={importSharePayload}
                >
                  <FolderOpen size={16} />
                  <span>共有コードを読み込み</span>
                </button>
              </>
            )}
          </section>
        </aside>

        <section className="score-column">
          <div className="sheet-toolbar">
            <input
              aria-label="タイトル"
              value={meta.title}
              onChange={(event) => updateMeta("title", event.target.value)}
            />
            <input
              aria-label="歌い手"
              placeholder="歌い手"
              value={meta.vocalist}
              onChange={(event) => updateMeta("vocalist", event.target.value)}
            />
            <input
              aria-label="キー"
              value={meta.key}
              onChange={(event) => updateMeta("key", event.target.value)}
            />
            <input
              aria-label="テンポ"
              value={meta.tempo}
              onChange={(event) => updateMeta("tempo", event.target.value)}
            />
          </div>

          <div className="sheet-view-controls" aria-label="譜面表示">
            <div className="segmented-control layout-mode-control">
              {[
                ["lyricCard", "歌詞カード"],
                ["staff", "5線譜"]
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={sheetLayoutMode === mode ? "active" : ""}
                  onClick={() => setSheetLayoutMode(mode as SheetLayoutMode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="segmented-control">
              {[
                ["original", "原文"],
                ["reading", "ひらがな"],
                ["vowel", "母音"]
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={lyricDisplayMode === mode ? "active" : ""}
                  onClick={() => setLyricDisplayMode(mode as LyricDisplayMode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showChords}
                onChange={(event) => setShowChords(event.target.checked)}
              />
              <span>コード表示</span>
            </label>
          </div>

          <div ref={scoreStageRef} className="score-stage">
            {sheetPages.map((pageIndex) => (
              <div
                key={pageIndex}
                ref={pageIndex === 0 ? sheetRef : undefined}
                data-page-index={pageIndex}
                className={`score-page layout-${sheetLayoutMode} ${
                  showChords ? "" : "hide-chords"
                }`}
                onPointerDown={handleSheetPointerDown}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="page-meta">
                  <strong>{meta.title || "Untitled"}</strong>
                  <span>{meta.vocalist || "Vocal"}</span>
                  <span>Key {meta.key || "-"}</span>
                  <span>{meta.tempo || "-"} BPM</span>
                  {sheetPageCount > 1 && <span>{pageIndex + 1} / {sheetPageCount}</span>}
                </div>

                {pageIndex === 0 && (isAutoScrolling || autoScrollElapsed > 0) && (
                  <div
                    className={`auto-scroll-guide ${
                      isAutoScrolling ? "running" : ""
                    }`}
                    style={{ top: `${autoScrollGuideTop}%` }}
                    aria-hidden="true"
                  />
                )}

                {SYSTEMS.map((system, systemIndex) => (
                  (() => {
                    const rowIndex = pageIndex * ROWS_PER_PAGE + systemIndex;
                    const sectionSlot = sectionByRow.get(rowIndex);
                    const sectionLabel = sectionSlot
                      ? sectionSlot.section.name
                      : `${rowIndex + 1}`;
                    const measureLabel = sectionSlot
                      ? [
                          sectionSlot.section.startMeasure
                            ? `${sectionSlot.section.startMeasure}小節`
                            : "",
                          sectionSlot.section.recordingStartMeasure
                            ? `録${sectionSlot.section.recordingStartMeasure}`
                            : ""
                        ]
                          .filter(Boolean)
                          .join(" / ")
                      : "";

                    return (
                      <div
                        key={systemIndex}
                        className="system"
                        style={{
                          top: `${system.top}%`,
                          height: `${system.height}%`
                        }}
                      >
                        <div className="phrase-row-header">
                          <span
                            className="section-cell"
                            style={
                              {
                                "--section-color":
                                  sectionSlot?.section.color ?? "#0891b2"
                              } as CSSProperties
                            }
                          >
                            <strong>{sectionLabel}</strong>
                            {measureLabel && <small>{measureLabel}</small>}
                          </span>
                          <span className="chord-lane-label" aria-label="コード欄" />
                        </div>
                        <div className="staff-lines" aria-hidden="true">
                          {[0, 1, 2, 3, 4].map((lineIndex) => (
                            <span
                              key={lineIndex}
                              style={{ "--line-index": lineIndex } as CSSProperties}
                            />
                          ))}
                        </div>
                        <div className="note-writing-lane" aria-hidden="true" />
                        <div className="lyric-writing-lane" aria-hidden="true" />
                      </div>
                    );
                  })()
                ))}

                {items
                  .filter((item) => getItemPageIndex(item) === pageIndex)
                  .map((item) => {
                    if (!showChords && item.toolId === "chord") {
                      return null;
                    }

                    const tool = TOOL_BY_ID[item.toolId];
                    const displayLabel = getItemDisplayLabel(item);
                    const isEditableSheetText = isSheetLyricItem(item);
                    const isInlineEditing =
                      editingItemId === item.id && isEditableSheetText;
                    const itemStyle = {
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      fontSize: `${item.size}px`,
                      "--item-color": item.color,
                      "--highlight-color": item.highlightColor ?? "transparent",
                      ...(item.width
                        ? {
                            width: `${item.width}%`,
                            maxWidth: `${item.width}%`
                          }
                        : {}),
                      textAlign: item.align ?? "center"
                    } as CSSProperties;
                    const sheetItemClassName = `sheet-item sheet-${tool.kind} tool-${
                      item.toolId
                    } align-${item.align ?? "center"} ${
                      selectedId === item.id ? "selected" : ""
                    } ${item.highlightColor ? "has-highlight" : ""} ${
                      item.comment ? "has-comment" : ""
                    }`;

                    if (isInlineEditing) {
                      return (
                        <textarea
                          key={item.id}
                          className={`sheet-inline-editor ${sheetItemClassName}`}
                          style={itemStyle}
                          value={getEditableItemLabel(item)}
                          rows={Math.min(
                            8,
                            Math.max(
                              2,
                              getEditableItemLabel(item).split(/\r?\n/).length
                            )
                          )}
                          autoFocus
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            updateItemLabel(item.id, event.target.value)
                          }
                          onBlur={() => {
                            setEditingItemId("");
                            setStatus("歌詞を更新");
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Escape" ||
                              ((event.ctrlKey || event.metaKey) &&
                                event.key === "Enter")
                            ) {
                              event.preventDefault();
                              event.stopPropagation();
                              setEditingItemId("");
                            }
                          }}
                          aria-label="譜面上の歌詞を編集"
                        />
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={sheetItemClassName}
                        style={itemStyle}
                        onPointerDown={(event) => handleItemPointerDown(event, item)}
                        onDoubleClick={() => {
                          if (isEditableSheetText) {
                            startInlineEdit(item.id);
                            return;
                          }

                          const nextLabel = window.prompt(
                            "表示",
                            getEditableItemLabel(item)
                          );
                          if (nextLabel !== null) {
                            updateItemLabel(item.id, nextLabel);
                          }
                        }}
                        title={
                          isEditableSheetText
                            ? `${tool.name}: ダブルクリックで編集`
                            : tool.name
                        }
                      >
                        <span className="item-content">
                          {renderToolGlyph(item.toolId, displayLabel)}
                        </span>
                        {item.comment && (
                          <span className="comment-badge" title={item.comment}>
                            <MessageSquare size={10} />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </section>

        <aside className="side-panel right-panel">
          <section className="panel-section tool-palette">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("tools")}
              aria-expanded={!collapsedPanels.tools}
            >
              <Keyboard size={18} />
              <span>ツール</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.tools ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.tools && (
              <>
                {activeToolSpec && (
                  <button
                    type="button"
                    className="tool-clear-button"
                    onClick={clearActiveTool}
                  >
                    <X size={16} />
                    <span>記号選択を解除</span>
                  </button>
                )}
                <div className="tool-grid">
                  {SHEET_TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      draggable
                      className={`tool-button tool-${tool.id} ${
                        activeTool === tool.id ? "active" : ""
                      }`}
                      style={{ "--tool-color": tool.color } as CSSProperties}
                      onClick={() => selectTool(tool.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          "application/x-vocal-tool",
                          tool.id
                        );
                      }}
                      title={`${tool.name} ${tool.shortcut}`}
                    >
                      <span className="tool-symbol">
                        {renderToolGlyph(tool.id, tool.label)}
                      </span>
                      <span className="tool-name">{tool.name}</span>
                      <kbd>{tool.shortcut}</kbd>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel-section">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("settings")}
              aria-expanded={!collapsedPanels.settings}
            >
              <SlidersHorizontal size={18} />
              <span>譜面設定</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.settings ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.settings && (
              <>
                <label className="field-label" htmlFor="quickChord">
                  コードネーム
                </label>
                <div className="inline-form">
                  <input
                    id="quickChord"
                    aria-label="コードネーム"
                    placeholder="Cmaj7 / Am7 / G7"
                    value={quickChord}
                    onChange={(event) => {
                      setQuickChord(event.target.value);
                      setActiveTool("chord");
                    }}
                    onFocus={() => setActiveTool("chord")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addQuickChord();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="square-button"
                    onClick={addQuickChord}
                    title="コードネームを譜面へ追加"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="chord-presets" aria-label="よく使うコード">
                  {COMMON_CHORDS.map((chord) => (
                    <button
                      key={chord}
                      type="button"
                      onClick={() => {
                        setQuickChord(chord);
                        if (selectedItem) {
                          addChordName(chord);
                          return;
                        }
                        setActiveTool("chord");
                        setStatus(`${chord}を入力`);
                      }}
                    >
                      {chord}
                    </button>
                  ))}
                </div>

                <label className="field-label" htmlFor="dictionMark">
                  滑舌・発音マーカー
                </label>
                <div className="inline-form">
                  <input
                    id="dictionMark"
                    aria-label="滑舌・発音マーカー"
                    value={dictionMark}
                    onChange={(event) => {
                      setDictionMark(event.target.value);
                      setActiveTool("diction");
                    }}
                    onFocus={() => setActiveTool("diction")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const markIndex =
                          items.filter((item) => item.toolId === "diction").length %
                          4;
                        addItemAt(
                          "diction",
                          16 + markIndex * 18,
                          SYSTEMS[1].top + 5.4,
                          dictionMark
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="square-button"
                    onClick={() => {
                      const markIndex =
                        items.filter((item) => item.toolId === "diction").length % 4;
                      addItemAt(
                        "diction",
                        16 + markIndex * 18,
                        SYSTEMS[1].top + 5.4,
                        dictionMark
                      );
                    }}
                    title="滑舌・発音マーカーを譜面へ追加"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <p className="preset-label">よく使う</p>
                <div className="diction-presets" aria-label="ピン止め候補">
                  {pinnedDictionOptions.map((mark) => (
                    <div className="diction-option" key={`pinned-${mark.value}`}>
                      <button
                        type="button"
                        className={`diction-mark-button ${
                          dictionMark === mark.value ? "active" : ""
                        }`}
                        onClick={() => {
                          setDictionMark(mark.value);
                          setActiveTool("diction");
                          setStatus(`${formatDictionMark(mark.value)}を入力`);
                        }}
                        title={mark.note}
                      >
                        <span>{mark.value}</span>
                        <small>{mark.note}</small>
                      </button>
                      <button
                        type="button"
                        className="pin-button pinned"
                        onClick={() => toggleDictionPin(mark.value)}
                        title="ピン止めを外す"
                      >
                        <Pin size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="preset-label">すべて</p>
                {DICTION_GROUPS.map((group) => (
                  <div className="diction-group" key={group.label}>
                    <p className="preset-label subtle">{group.label}</p>
                    <div className="diction-presets" aria-label={group.label}>
                      {group.values.map((value) => {
                        const mark = DICTION_MARKS.find(
                          (candidate) => candidate.value === value
                        );
                        if (!mark) {
                          return null;
                        }

                        const isPinned = pinnedDictionMarks.includes(mark.value);

                        return (
                          <div className="diction-option" key={mark.value}>
                            <button
                              type="button"
                              className={`diction-mark-button ${
                                dictionMark === mark.value ? "active" : ""
                              }`}
                              onClick={() => {
                                setDictionMark(mark.value);
                                setActiveTool("diction");
                                setStatus(`${formatDictionMark(mark.value)}を入力`);
                              }}
                              title={mark.note}
                            >
                              <span>{mark.value}</span>
                              <small>{mark.note}</small>
                            </button>
                            <button
                              type="button"
                              className={`pin-button ${isPinned ? "pinned" : ""}`}
                              onClick={() => toggleDictionPin(mark.value)}
                              title={isPinned ? "ピン止めを外す" : "ピン止め"}
                            >
                              <Pin size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <label className="field-label" htmlFor="sectionName">
                  セクション・録音メモ
                </label>
                <div className="section-editor">
                  <select
                    aria-label="開始段"
                    value={sectionStartRow}
                    onChange={(event) => {
                      const nextRow = Number(event.target.value);
                      setSectionStartRow(nextRow);
                      setSectionEndRow((current) => Math.max(current, nextRow));
                    }}
                  >
                    {sectionRowOptions.map((rowIndex) => (
                      <option key={rowIndex} value={rowIndex}>
                        開始 {rowIndex + 1}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="終了段"
                    value={sectionEndRow}
                    onChange={(event) => setSectionEndRow(Number(event.target.value))}
                  >
                    {sectionRowOptions.map((rowIndex) => (
                      <option key={rowIndex} value={rowIndex}>
                        終了 {rowIndex + 1}
                      </option>
                    ))}
                  </select>
                  <select
                    id="sectionName"
                    value={sectionName}
                    onChange={(event) => setSectionName(event.target.value)}
                  >
                    {SECTION_PRESETS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  aria-label="自由入力のセクション名"
                  value={sectionName}
                  onChange={(event) => setSectionName(event.target.value)}
                  placeholder="自由入力"
                />
                <div className="measure-editor">
                  <input
                    aria-label="曲中の開始小節"
                    placeholder="開始小節"
                    value={sectionStartMeasure}
                    onChange={(event) => setSectionStartMeasure(event.target.value)}
                  />
                  <input
                    aria-label="録音スタート小節"
                    placeholder="録音スタート"
                    value={sectionRecordingStartMeasure}
                    onChange={(event) =>
                      setSectionRecordingStartMeasure(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="square-button"
                    onClick={upsertSection}
                    title="セクションを設定"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="recording-order-list" aria-label="録音順">
                  {normalizedSections.map((section, index) => (
                    <div
                      key={section.id}
                      className="recording-section"
                      style={{ "--section-color": section.color } as CSSProperties}
                    >
                      <button
                        type="button"
                        className="section-edit-button"
                        onClick={() => fillSectionForm(section)}
                        title="入力欄へ反映"
                      >
                        <strong>{section.name}</strong>
                        <small>
                          {getSectionStartRow(section) + 1}
                          {getSectionEndRow(section) !== getSectionStartRow(section)
                            ? `-${getSectionEndRow(section) + 1}`
                            : ""}
                          段 / {section.startMeasure || "-"}小節 / 録
                          {section.recordingStartMeasure || "-"}
                        </small>
                      </button>
                      <div className="section-order-actions">
                        <button
                          type="button"
                          onClick={() => moveSection(section.id, -1)}
                          disabled={index === 0}
                          title="上へ"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section.id, 1)}
                          disabled={index === normalizedSections.length - 1}
                          title="下へ"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSection(section.id)}
                          title="外す"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <label className="field-label" htmlFor="memo">
                  メモ
                </label>
                <textarea
                  id="memo"
                  value={meta.memo}
                  onChange={(event) => updateMeta("memo", event.target.value)}
                  rows={4}
                />
              </>
            )}
          </section>

          <section className="panel-section">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("inspector")}
              aria-expanded={!collapsedPanels.inspector}
            >
              <Music2 size={18} />
              <span>選択中</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.inspector ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>

            {!collapsedPanels.inspector && selectedItem ? (
              <div className="inspector">
                <label className="field-label" htmlFor="itemLabel">
                  表示
                </label>
                <input
                  id="itemLabel"
                  value={getEditableItemLabel(selectedItem)}
                  onChange={(event) =>
                    updateItemLabel(selectedItem.id, event.target.value)
                  }
                />

                <div className="section-row-tools">
                  <label className="field-label" htmlFor="selectedRowSection">
                    この段のセクション
                  </label>
                  <select
                    id="selectedRowSection"
                    value={selectedItemSectionName}
                    onChange={(event) =>
                      updateRowSectionName(
                        selectedItemRowIndex,
                        event.target.value
                      )
                    }
                  >
                    <option value="">未設定</option>
                    {sectionNameOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="field-label" htmlFor="itemSize">
                  サイズ
                </label>
                <input
                  id="itemSize"
                  type="range"
                  min={10}
                  max={48}
                  value={selectedItem.size}
                  onChange={(event) =>
                    updateItem(selectedItem.id, {
                      size: Number(event.target.value)
                    })
                  }
                />

                <div className="swatches" aria-label="色">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => updateItem(selectedItem.id, { color })}
                      title={color}
                    />
                  ))}
                  <input
                    aria-label="色を選択"
                    type="color"
                    value={selectedItem.color}
                    onChange={(event) =>
                      updateItem(selectedItem.id, { color: event.target.value })
                    }
                  />
                </div>

                {["lyric", "vowel"].includes(selectedItem.toolId) && (
                  <div className="lyric-marker-tools">
                    <label className="field-label">歌詞マーカー</label>
                    <div className="marker-swatches" aria-label="マーカー色">
                      {HIGHLIGHT_SWATCHES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          style={{ backgroundColor: color }}
                          onClick={() =>
                            updateItem(selectedItem.id, { highlightColor: color })
                          }
                          title={color}
                        />
                      ))}
                      <button
                        type="button"
                        className="clear-marker"
                        onClick={() =>
                          updateItem(selectedItem.id, {
                            highlightColor: "",
                            comment: ""
                          })
                        }
                      >
                        解除
                      </button>
                    </div>
                    <label className="field-label" htmlFor="itemComment">
                      コメント
                    </label>
                    <textarea
                      id="itemComment"
                      value={selectedItem.comment ?? ""}
                      onChange={(event) =>
                        updateItem(selectedItem.id, {
                          comment: event.target.value
                        })
                      }
                      rows={3}
                    />
                  </div>
                )}

                <div className="button-row">
                  <button
                    type="button"
                    className="control-button danger"
                    onClick={removeSelected}
                  >
                    <Trash2 size={16} />
                    <span>削除</span>
                  </button>
                </div>
              </div>
            ) : !collapsedPanels.inspector ? (
              <p className="empty-state">未選択</p>
            ) : null}
          </section>

          <section className="panel-section">
            <button
              type="button"
              className="section-heading section-toggle"
              onClick={() => togglePanel("cleanup")}
              aria-expanded={!collapsedPanels.cleanup}
            >
              <RotateCcw size={18} />
              <span>整理</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.cleanup ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.cleanup && (
              <button type="button" className="wide-button neutral" onClick={resetSheet}>
                <Eraser size={16} />
                <span>譜面を空にする</span>
              </button>
            )}
          </section>
        </aside>
      </div>

      {(selectedItem || activeToolSpec) && (
        <div
          className={`mobile-selection-bar ${
            selectedItem ? "" : "mobile-tool-bar"
          } ${
            selectedItem && isSheetLyricItem(selectedItem)
              ? "mobile-editable-bar"
              : ""
          }`}
          aria-label={selectedItem ? "選択中の操作" : "記号選択中の操作"}
        >
          <div className="mobile-selection-summary">
            <span>{selectedItem ? "選択中" : "配置待ち"}</span>
            <strong>
              {selectedItem
                ? getItemDisplayLabel(selectedItem)
                : activeToolSpec?.name}
            </strong>
          </div>
          <button
            type="button"
            className="mobile-selection-clear"
            onClick={selectedItem ? clearSelectionAndTool : clearActiveTool}
          >
            解除
          </button>
          {selectedItem && isSheetLyricItem(selectedItem) && (
            <button
              type="button"
              className="mobile-selection-edit"
              onClick={() => startInlineEdit(selectedItem.id)}
            >
              <Type size={17} />
              <span>編集</span>
            </button>
          )}
          {selectedItem && (
            <button
              type="button"
              className="mobile-selection-delete"
              onClick={() => {
                removeSelected();
                setActiveTool("");
              }}
            >
              <Trash2 size={17} />
              <span>削除</span>
            </button>
          )}
        </div>
      )}
    </main>
  );
}
