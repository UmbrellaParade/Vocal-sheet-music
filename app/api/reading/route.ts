import {
  convertPreservingKatakana,
  normalizeForSinging,
  parseReadingCorrections,
  roughHiragana
} from "@/lib/japanese";

export const runtime = "nodejs";

let converterPromise: Promise<{
  convert: (
    text: string,
    options: { to?: "hiragana"; mode?: "normal" | "spaced" | "okurigana" }
  ) => Promise<string>;
}> | null = null;

async function getConverter() {
  if (!converterPromise) {
    converterPromise = (async () => {
      const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] =
        await Promise.all([
          import("kuroshiro"),
          import("kuroshiro-analyzer-kuromoji")
        ]);
      const kuroshiro = new Kuroshiro();
      await kuroshiro.init(new KuromojiAnalyzer());
      return kuroshiro;
    })();
  }

  return converterPromise;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    corrections?: string;
  };
  const text = body.text?.trim() ?? "";
  const corrections = parseReadingCorrections(body.corrections ?? "");

  if (!text) {
    return Response.json({ reading: "", source: "empty" });
  }

  try {
    const converter = await getConverter();
    const reading = await convertPreservingKatakana(
      text,
      (segment) => converter.convert(segment, { to: "hiragana", mode: "normal" }),
      corrections
    );

    return Response.json({
      reading: normalizeForSinging(reading),
      source: "kuromoji"
    });
  } catch (error) {
    return Response.json({
      reading: roughHiragana(text, corrections),
      source: "fallback",
      warning: error instanceof Error ? error.message : "reading failed"
    });
  }
}
