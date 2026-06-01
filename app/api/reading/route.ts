import { normalizeForSinging, roughHiragana } from "@/lib/japanese";

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
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim() ?? "";

  if (!text) {
    return Response.json({ reading: "", source: "empty" });
  }

  try {
    const converter = await getConverter();
    const reading = await converter.convert(text, {
      to: "hiragana",
      mode: "normal"
    });

    return Response.json({
      reading: normalizeForSinging(reading),
      source: "kuromoji"
    });
  } catch (error) {
    return Response.json({
      reading: roughHiragana(text),
      source: "fallback",
      warning: error instanceof Error ? error.message : "reading failed"
    });
  }
}
