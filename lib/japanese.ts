const KANJI_HINTS: Array<[string, string]> = [
  ["私", "わたし"],
  ["僕", "ぼく"],
  ["君", "きみ"],
  ["貴方", "あなた"],
  ["今日", "きょう"],
  ["明日", "あした"],
  ["昨日", "きのう"],
  ["未来", "みらい"],
  ["過去", "かこ"],
  ["現在", "げんざい"],
  ["世界", "せかい"],
  ["心", "こころ"],
  ["夢", "ゆめ"],
  ["愛", "あい"],
  ["恋", "こい"],
  ["涙", "なみだ"],
  ["笑顔", "えがお"],
  ["声", "こえ"],
  ["歌", "うた"],
  ["音", "おと"],
  ["空", "そら"],
  ["雨", "あめ"],
  ["風", "かぜ"],
  ["夜", "よる"],
  ["朝", "あさ"],
  ["光", "ひかり"],
  ["星", "ほし"],
  ["月", "つき"],
  ["太陽", "たいよう"],
  ["花", "はな"],
  ["道", "みち"],
  ["時間", "じかん"],
  ["永遠", "えいえん"],
  ["言葉", "ことば"],
  ["約束", "やくそく"],
  ["希望", "きぼう"],
  ["自由", "じゆう"],
  ["一人", "ひとり"],
  ["二人", "ふたり"],
  ["幸せ", "しあわせ"],
  ["悲しみ", "かなしみ"],
  ["優しい", "やさしい"],
  ["強く", "つよく"],
  ["弱さ", "よわさ"],
  ["歩く", "あるく"],
  ["走る", "はしる"],
  ["生きる", "いきる"],
  ["抱きしめ", "だきしめ"],
  ["忘れない", "わすれない"],
  ["会いたい", "あいたい"]
];

const SMALL_VOWELS: Record<string, string> = {
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  ゃ: "あ",
  ゅ: "う",
  ょ: "お",
  ゎ: "あ"
};

const VOWEL_GROUPS: Record<string, string> = {
  あ: "あかさたなはまやらわがざだばぱぁゃゎ",
  い: "いきしちにひみりぎじぢびぴぃ",
  う: "うくすつぬふむゆるぐずづぶぷぅゅゔ",
  え: "えけせてねへめれげぜでべぺぇ",
  お: "おこそとのほもよろをごぞどぼぽぉょ"
};

// カタカナ → ひらがな（母音抽出など内部処理用）
export function katakanaToHiragana(input: string) {
  return input.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

// カタカナを保護してから変換関数を呼び、終わったら元に戻す（非同期版）
// 例: "東京タワー" → kuroshiro → "とうきょうタワー"
export async function convertPreservingKatakana(
  text: string,
  convert: (segment: string) => Promise<string>
): Promise<string> {
  // カタカナ区間（ァ-ン + ー）と非カタカナ区間に分割
  // split の奇数インデックス部分がカタカナ
  const parts = text.split(/([ァ-ヶー]+)/);
  const results = await Promise.all(
    parts.map((part, index) =>
      index % 2 === 1 ? Promise.resolve(part) : convert(part)
    )
  );
  return results.join("");
}

export function normalizeForSinging(input: string) {
  // カタカナはひらがなに変換しない（カタカナはそのまま保持）
  return input
    .replace(/[「」『』【】（）()［\][\]{}]/g, "")
    .replace(/[！？!?]/g, " ")
    .replace(/[、。,.]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function roughHiragana(input: string) {
  const sortedHints = [...KANJI_HINTS].sort((a, b) => b[0].length - a[0].length);
  const converted = sortedHints.reduce(
    (text, [kanji, reading]) => text.replaceAll(kanji, reading),
    input
  );

  // カタカナは保持したまま正規化のみ行う
  return normalizeForSinging(converted);
}

function getVowel(char: string) {
  for (const [vowel, chars] of Object.entries(VOWEL_GROUPS)) {
    if (chars.includes(char)) {
      return vowel;
    }
  }

  return "";
}

export function toVowels(input: string) {
  // 母音抽出のためカタカナをひらがなに変換してから処理
  const text = normalizeForSinging(katakanaToHiragana(input));
  const result: string[] = [];
  let previousVowel = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (next && SMALL_VOWELS[next] && "ゃゅょ".includes(next)) {
      const blendedVowel = SMALL_VOWELS[next];
      result.push(blendedVowel);
      previousVowel = blendedVowel;
      index += 1;
      continue;
    }

    if (SMALL_VOWELS[char]) {
      result.push(SMALL_VOWELS[char]);
      previousVowel = SMALL_VOWELS[char];
      continue;
    }

    if (char === "ー") {
      result.push(previousVowel || "ー");
      continue;
    }

    if (char === "ん" || char === "っ") {
      result.push(char);
      continue;
    }

    const vowel = getVowel(char);
    if (vowel) {
      result.push(vowel);
      previousVowel = vowel;
      continue;
    }

    result.push(char);
  }

  return result.join("").replace(/[ \t]+/g, " ").trim();
}

export function splitTextForPlacement(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tokens = line.split(/[ 　]+/).filter(Boolean);
      if (tokens.length > 1) {
        return tokens;
      }

      return line.match(/.{1,8}/g) ?? [line];
    });
}
