"use client";

import {
  ChevronDown,
  Download,
  Eraser,
  FileJson,
  FolderOpen,
  Keyboard,
  Music2,
  Pause,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Type,
  Upload,
  Wand2
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  roughHiragana,
  splitTextForPlacement,
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
  | "dynamic"
  | "marker";

type ToolKind = "text" | "symbol" | "chord";

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
  x: number;
  y: number;
  size: number;
  color: string;
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
  vowelLyrics: string;
  sections?: SectionEntry[];
  showChords?: boolean;
  lyricDisplayMode?: LyricDisplayMode;
};

type SectionEntry = {
  id: string;
  name: string;
  rowIndex: number;
  color: string;
};

type LyricDisplayMode = "original" | "reading" | "vowel";

type PanelId =
  | "lyrics"
  | "audio"
  | "tools"
  | "settings"
  | "inspector"
  | "cleanup";

const STORAGE_KEY = "vocal-sheet-music:draft:v1";

const DEFAULT_META: SheetMeta = {
  title: "新しい歌唱譜",
  vocalist: "",
  key: "C",
  tempo: "120",
  memo: ""
};

const SHEET_TOOLS: ToolSpec[] = [
  {
    id: "lyric",
    name: "歌詞",
    label: "la",
    shortcut: "L",
    color: "#f8fafc",
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
    id: "vibrato",
    name: "ビブラート",
    label: "W",
    shortcut: "V",
    color: "#39ff55",
    size: 30,
    kind: "symbol"
  },
  {
    id: "breath",
    name: "ブレス",
    label: "V",
    shortcut: "B",
    color: "#60a5fa",
    size: 26,
    kind: "symbol"
  },
  {
    id: "scoop",
    name: "しゃくり",
    label: "↗",
    shortcut: "S",
    color: "#ff2d2d",
    size: 28,
    kind: "symbol"
  },
  {
    id: "fall",
    name: "フォール",
    label: "↘",
    shortcut: "F",
    color: "#d946ef",
    size: 28,
    kind: "symbol"
  },
  {
    id: "kobushi",
    name: "こぶし",
    label: "○",
    shortcut: "U",
    color: "#22d3ee",
    size: 30,
    kind: "symbol"
  },
  {
    id: "accent",
    name: "アクセント",
    label: ">",
    shortcut: "A",
    color: "#fb7185",
    size: 28,
    kind: "symbol"
  },
  {
    id: "diction",
    name: "滑舌注意",
    label: "活K",
    shortcut: "K",
    color: "#f97316",
    size: 24,
    kind: "symbol"
  },
  {
    id: "hold",
    name: "ロング",
    label: "━",
    shortcut: "H",
    color: "#facc15",
    size: 28,
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
    name: "区切り",
    label: "A",
    shortcut: "M",
    color: "#fb923c",
    size: 18,
    kind: "text"
  }
];

const SYSTEMS = [
  { top: 8, height: 9.8 },
  { top: 20.2, height: 9.8 },
  { top: 32.4, height: 9.8 },
  { top: 44.6, height: 9.8 },
  { top: 56.8, height: 9.8 },
  { top: 69, height: 9.8 },
  { top: 81.2, height: 9.8 }
];

const COLOR_SWATCHES = [
  "#00d4ff",
  "#39ff55",
  "#22d3ee",
  "#ff2d2d",
  "#facc15",
  "#fb7185",
  "#4ade80",
  "#60a5fa",
  "#a78bfa",
  "#fb923c",
  "#f97316",
  "#f8fafc"
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
  { id: "section-a1", name: "Aメロ1", rowIndex: 0, color: SECTION_COLORS[0] },
  { id: "section-a2", name: "Aメロ2", rowIndex: 1, color: SECTION_COLORS[1] },
  { id: "section-b", name: "Bメロ", rowIndex: 2, color: SECTION_COLORS[2] },
  { id: "section-chorus", name: "サビ", rowIndex: 3, color: SECTION_COLORS[3] },
  { id: "section-c", name: "Cメロ", rowIndex: 4, color: SECTION_COLORS[4] }
];

const ART_SYMBOL_TOOL_IDS: ToolId[] = [
  "scoop",
  "fall",
  "vibrato",
  "kobushi",
  "breath"
];

const AUDIO_DB_NAME = "vocal-sheet-music-audio";
const AUDIO_STORE_NAME = "audio";
const AUDIO_RECORD_ID = "current-song";

const DICTION_MARKS = [
  { value: "T", note: "タ行" },
  { value: "S", note: "サ行" },
  { value: "K", note: "カ行" },
  { value: "R", note: "ラ行" },
  { value: "L", note: "L" },
  { value: "N", note: "ナ行" },
  { value: "th", note: "TH" },
  { value: "f", note: "F" },
  { value: "v", note: "V" },
  { value: "m", note: "M" }
];

const TOOL_BY_ID = SHEET_TOOLS.reduce(
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const [meta, setMeta] = useState<SheetMeta>(DEFAULT_META);
  const [items, setItems] = useState<SheetItem[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId>("vibrato");
  const [selectedId, setSelectedId] = useState<string>("");
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [sourceLyrics, setSourceLyrics] = useState(
    "雨上がりの空に 君の声がひびく\n明日へ続く道を もう一度歩こう"
  );
  const [readingLyrics, setReadingLyrics] = useState("");
  const [vowelLyrics, setVowelLyrics] = useState("");
  const [quickChord, setQuickChord] = useState("C");
  const [dictionMark, setDictionMark] = useState("K");
  const [showChords, setShowChords] = useState(true);
  const [lyricDisplayMode, setLyricDisplayMode] =
    useState<LyricDisplayMode>("original");
  const [sections, setSections] = useState<SectionEntry[]>(DEFAULT_SECTIONS);
  const [sectionRow, setSectionRow] = useState(0);
  const [sectionName, setSectionName] = useState(SECTION_PRESETS[0]);
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
    audio: false,
    tools: false,
    settings: false,
    inspector: false,
    cleanup: false
  });

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId]
  );

  const sectionByRow = useMemo(() => {
    return new Map(sections.map((section) => [section.rowIndex, section]));
  }, [sections]);

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
      vowelLyrics,
      sections,
      showChords,
      lyricDisplayMode
    }),
    [
      items,
      lyricDisplayMode,
      meta,
      readingLyrics,
      sections,
      showChords,
      sourceLyrics,
      vowelLyrics
    ]
  );

  const getItemDisplayLabel = useCallback(
    (item: SheetItem) => {
      if (item.toolId !== "lyric") {
        return item.label;
      }

      if (lyricDisplayMode === "reading") {
        return roughHiragana(item.label);
      }

      if (lyricDisplayMode === "vowel") {
        return toVowels(roughHiragana(item.label));
      }

      return item.label;
    },
    [lyricDisplayMode]
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

  const addItemAt = useCallback(
    (toolId: ToolId, x: number, y: number, labelOverride?: string) => {
      const tool = TOOL_BY_ID[toolId];
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
        y,
        size: tool.size,
        color: tool.color
      };

      setItems((current) => [...current, item]);
      setSelectedId(item.id);
      setStatus(`${tool.name}を追加`);
    },
    [dictionMark, quickChord]
  );

  const hydrateDraft = useCallback((nextDraft: Partial<DraftData>) => {
    setMeta({ ...DEFAULT_META, ...(nextDraft.meta ?? {}) });
    setItems(Array.isArray(nextDraft.items) ? nextDraft.items : []);
    setSourceLyrics(nextDraft.sourceLyrics ?? "");
    setReadingLyrics(nextDraft.readingLyrics ?? "");
    setVowelLyrics(nextDraft.vowelLyrics ?? "");
    setSections(
      Array.isArray(nextDraft.sections) ? nextDraft.sections : DEFAULT_SECTIONS
    );
    setShowChords(nextDraft.showChords ?? true);
    setLyricDisplayMode(nextDraft.lyricDisplayMode ?? "original");
    setSelectedId("");
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

  const updateItem = useCallback((id: string, patch: Partial<SheetItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedId) {
      return;
    }

    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId("");
    setStatus("削除しました");
  }, [selectedId]);

  const placeTextOnSheet = useCallback(
    (text: string, toolId: Extract<ToolId, "lyric" | "vowel">) => {
      const rows = splitTextForPlacement(text);
      if (!rows.length) {
        setStatus("配置するテキストなし");
        return;
      }

      const tool = TOOL_BY_ID[toolId];
      const placedItems: SheetItem[] = [];

      rows.slice(0, SYSTEMS.length).forEach((tokens, rowIndex) => {
        const system = SYSTEMS[rowIndex];
        const y =
          toolId === "vowel"
            ? system.top + system.height - 0.5
            : system.top + system.height - 3;
        const denominator = Math.max(tokens.length - 1, 1);

        tokens.forEach((token, tokenIndex) => {
          placedItems.push({
            id: createId(),
            toolId,
            label: token,
            x: tokens.length === 1 ? 50 : 10 + (80 * tokenIndex) / denominator,
            y,
            size: tool.size,
            color: tool.color
          });
        });
      });

      setItems((current) => [...current, ...placedItems]);
      setSelectedId(placedItems.at(-1)?.id ?? "");
      setStatus(`${tool.name}を配置`);
    },
    []
  );

  const convertToReading = useCallback(async () => {
    setIsConverting(true);
    setStatus("ひらがな変換中");

    try {
      const response = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceLyrics })
      });

      const data = (await response.json()) as {
        reading?: string;
        source?: string;
      };
      setReadingLyrics(data.reading ?? roughHiragana(sourceLyrics));
      setStatus(data.source === "kuromoji" ? "変換しました" : "簡易変換しました");
    } catch {
      setReadingLyrics(roughHiragana(sourceLyrics));
      setStatus("簡易変換しました");
    } finally {
      setIsConverting(false);
    }
  }, [sourceLyrics]);

  const convertReadingToVowels = useCallback(() => {
    const base = readingLyrics || roughHiragana(sourceLyrics);
    setVowelLyrics(toVowels(base));
    setStatus("母音に変換しました");
  }, [readingLyrics, sourceLyrics]);

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
      vowelLyrics: "",
      sections: DEFAULT_SECTIONS,
      showChords: true,
      lyricDisplayMode: "original"
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
      const position = getPointerPosition(event.clientX, event.clientY);
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
  }, [dragging, getPointerPosition, updateItem]);

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

    const position = getPointerPosition(event.clientX, event.clientY);
    addItemAt(activeTool, position.x, position.y);
  };

  const handleItemPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: SheetItem
  ) => {
    event.stopPropagation();
    setSelectedId(item.id);
    const position = getPointerPosition(event.clientX, event.clientY);
    setDragging({
      id: item.id,
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

    const position = getPointerPosition(event.clientX, event.clientY);
    addItemAt(value, position.x, position.y);
  };

  const addQuickChord = () => {
    const chordIndex = items.filter((item) => item.toolId === "chord").length % 4;
    addItemAt("chord", 14 + chordIndex * 22, SYSTEMS[0].top + 1.2, quickChord);
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
      const color = SECTION_COLORS[sectionRow % SECTION_COLORS.length];
      const nextSection: SectionEntry = {
        id: `section-${sectionRow}-${trimmedName}`,
        name: trimmedName,
        rowIndex: sectionRow,
        color
      };

      return [
        ...current.filter((section) => section.rowIndex !== sectionRow),
        nextSection
      ].sort((a, b) => a.rowIndex - b.rowIndex);
    });
    setStatus(`${trimmedName}を設定`);
  };

  const removeSection = (rowIndex: number) => {
    setSections((current) =>
      current.filter((section) => section.rowIndex !== rowIndex)
    );
    setStatus("セクションを外しました");
  };

  const updateMeta = (key: keyof SheetMeta, value: string) => {
    setMeta((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="app-shell">
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
          <section className="panel-section">
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
                <label className="field-label" htmlFor="sourceLyrics">
                  原文
                </label>
                <textarea
                  id="sourceLyrics"
                  value={sourceLyrics}
                  onChange={(event) => setSourceLyrics(event.target.value)}
                  rows={5}
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
                    onClick={convertReadingToVowels}
                  >
                    <FileJson size={16} />
                    <span>母音</span>
                  </button>
                </div>

                <label className="field-label" htmlFor="readingLyrics">
                  読み
                </label>
                <textarea
                  id="readingLyrics"
                  value={readingLyrics}
                  onChange={(event) => setReadingLyrics(event.target.value)}
                  rows={4}
                />
                <button
                  type="button"
                  className="wide-button"
                  onClick={() => placeTextOnSheet(readingLyrics, "lyric")}
                >
                  <Plus size={16} />
                  <span>歌詞を配置</span>
                </button>

                <label className="field-label" htmlFor="vowelLyrics">
                  母音
                </label>
                <textarea
                  id="vowelLyrics"
                  value={vowelLyrics}
                  onChange={(event) => setVowelLyrics(event.target.value)}
                  rows={4}
                />
                <button
                  type="button"
                  className="wide-button"
                  onClick={() => placeTextOnSheet(vowelLyrics, "vowel")}
                >
                  <Plus size={16} />
                  <span>母音を配置</span>
                </button>
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

          <div className="score-stage">
            <div
              ref={sheetRef}
              className={`score-page ${showChords ? "" : "hide-chords"}`}
              onPointerDown={handleSheetPointerDown}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="page-meta">
                <strong>{meta.title || "Untitled"}</strong>
                <span>{meta.vocalist || "Vocal"}</span>
                <span>Key {meta.key || "-"}</span>
                <span>{meta.tempo || "-"} BPM</span>
              </div>

              {SYSTEMS.map((system, systemIndex) => (
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
                      style={
                        {
                          "--section-color":
                            sectionByRow.get(systemIndex)?.color ?? "#0891b2"
                        } as CSSProperties
                      }
                    >
                      {sectionByRow.get(systemIndex)?.name ?? systemIndex + 1}
                    </span>
                    <span>コード</span>
                  </div>
                  <div className="note-writing-lane" aria-hidden="true" />
                  <div className="lyric-writing-lane" aria-hidden="true" />
                </div>
              ))}

              {items.map((item) => {
                if (!showChords && item.toolId === "chord") {
                  return null;
                }

                const tool = TOOL_BY_ID[item.toolId];
                const displayLabel = getItemDisplayLabel(item);
                const itemStyle = {
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  fontSize: `${item.size}px`,
                  "--item-color": item.color
                } as CSSProperties;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sheet-item sheet-${tool.kind} tool-${item.toolId} ${
                      selectedId === item.id ? "selected" : ""
                    }`}
                    style={itemStyle}
                    onPointerDown={(event) => handleItemPointerDown(event, item)}
                    onDoubleClick={() => {
                      const nextLabel = window.prompt("表示", item.label);
                      if (nextLabel !== null) {
                        updateItem(item.id, { label: nextLabel });
                      }
                    }}
                    title={tool.name}
                  >
                    {renderToolGlyph(item.toolId, displayLabel)}
                  </button>
                );
              })}
            </div>
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
              <span>記号</span>
              <ChevronDown
                className={`section-chevron ${
                  collapsedPanels.tools ? "collapsed" : ""
                }`}
                size={18}
              />
            </button>
            {!collapsedPanels.tools && (
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
                    onClick={() => setActiveTool(tool.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("application/x-vocal-tool", tool.id);
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
                <div className="diction-presets" aria-label="滑舌・発音候補">
                  {DICTION_MARKS.map((mark) => (
                    <button
                      key={mark.value}
                      type="button"
                      className={dictionMark === mark.value ? "active" : ""}
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
                  ))}
                </div>

                <label className="field-label" htmlFor="sectionName">
                  セクション
                </label>
                <div className="section-editor">
                  <select
                    aria-label="段"
                    value={sectionRow}
                    onChange={(event) => setSectionRow(Number(event.target.value))}
                  >
                    {SYSTEMS.map((_, rowIndex) => (
                      <option key={rowIndex} value={rowIndex}>
                        {rowIndex + 1}段目
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
                  <button
                    type="button"
                    className="square-button"
                    onClick={upsertSection}
                    title="セクションを設定"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <input
                  aria-label="自由入力のセクション名"
                  value={sectionName}
                  onChange={(event) => setSectionName(event.target.value)}
                  placeholder="自由入力"
                />
                <div className="section-chips" aria-label="設定済みセクション">
                  {sections.map((section) => (
                    <button
                      key={`${section.rowIndex}-${section.id}`}
                      type="button"
                      style={{ "--section-color": section.color } as CSSProperties}
                      onClick={() => removeSection(section.rowIndex)}
                      title="クリックで外す"
                    >
                      <span>{section.rowIndex + 1}</span>
                      {section.name}
                    </button>
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
                  value={selectedItem.label}
                  onChange={(event) =>
                    updateItem(selectedItem.id, { label: event.target.value })
                  }
                />

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
    </main>
  );
}
