import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AgeGroup =
  | 'preschool'
  | 'elementary_lower'
  | 'elementary_upper'
  | 'adult';
export type Interest =
  | 'vehicles'
  | 'animals'
  | 'food'
  | 'sports'
  | 'music'
  | 'nature'
  | 'space'
  | 'art';
export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic';

export interface RewriteOptions {
  ageGroup: AgeGroup;
  interests: Interest[];
  learningStyle?: LearningStyle;
}

export interface RewriteResult {
  originalText: string;
  rewrittenText: string;
  examples: string[];
}

// 年齢グループ別の設定
const AGE_GROUP_CONFIG: Record<
  AgeGroup,
  { description: string; rules: string }
> = {
  preschool: {
    description: '幼児（3〜6歳）',
    rules: `
- ひらがなを中心に使用し、漢字は避ける
- 1文は15文字以内を目安に短く
- 「〜だよ」「〜ね」などやさしい語尾を使う
- 擬音語・擬態語を積極的に使う（「ぴょんぴょん」「くるくる」など）
- 身近な体験と結びつけた説明をする`,
  },
  elementary_lower: {
    description: '小学校低学年（1〜3年生）',
    rules: `
- 小学校低学年で習う漢字のみ使用（ふりがな付き）
- 1文は20文字以内を目安
- 「〜です」「〜ます」の丁寧語を使う
- 日常生活の例を多く使う`,
  },
  elementary_upper: {
    description: '小学校高学年（4〜6年生）',
    rules: `
- 小学校で習う漢字を使用可能
- 1文は30文字以内を目安
- 論理的な説明を含める
- 「なぜなら」「つまり」などの接続詞を使う`,
  },
  adult: {
    description: '大人・保育者',
    rules: `
- 専門用語を適切に使用
- 教育的な観点からの解説を含める
- 実践的な活用方法を提案`,
  },
};

// 興味関心別の具体例マッピング
const INTEREST_EXAMPLES: Record<Interest, string[]> = {
  vehicles: [
    '電車のドアの開閉',
    '信号機の色の順番',
    'バスの停留所',
    '飛行機の離着陸',
  ],
  animals: [
    'シマウマの縞模様',
    '蝶の羽の対称',
    '鳥の群れの動き',
    'アリの行列',
  ],
  food: [
    'おせんべいの模様',
    'ケーキのデコレーション',
    'おにぎりの形',
    'サンドイッチの重なり',
  ],
  sports: [
    'サッカーのパス回し',
    '体操の動きの順番',
    '野球のルール',
    'ダンスのステップ',
  ],
  music: [
    'リズムの繰り返し',
    'メロディのパターン',
    '楽器の音色',
    '歌の歌詞の韻',
  ],
  nature: ['季節の変化', '花の咲く順番', '雲の形', '川の流れ'],
  space: ['星座の形', '月の満ち欠け', '惑星の順番', 'ロケットの発射'],
  art: ['絵の構図', '色の組み合わせ', '粘土の形作り', '折り紙のパターン'],
};

/**
 * コンテンツを年齢・興味関心に応じてリライトする
 */
export async function rewriteContent(
  content: string,
  options: RewriteOptions
): Promise<RewriteResult> {
  const { ageGroup, interests } = options;
  const ageConfig = AGE_GROUP_CONFIG[ageGroup];

  // 興味関心に基づく具体例を収集
  const examples: string[] = [];
  for (const interest of interests) {
    examples.push(...(INTEREST_EXAMPLES[interest] || []));
  }

  const systemPrompt = `あなたは幼児教育の専門家です。
以下の教育コンテンツを、指定された年齢層と興味関心に合わせてリライトしてください。

## 対象年齢: ${ageConfig.description}

## リライトのルール
${ageConfig.rules}

## 追加ルール
1. 具体例: 抽象的な概念は、以下の興味関心に関連する具体例で説明
   興味関心: ${interests.join(', ')}
   使える具体例: ${examples.slice(0, 5).join(', ')}
2. 感情: 「すごいね！」「ふしぎだね！」など感嘆表現を適度に挿入
3. 対話: 「〇〇って知ってる？」など問いかけを含める

## 出力形式
リライトしたコンテンツのみを出力してください。`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下のコンテンツをリライトしてください:\n\n${content}` },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const rewrittenText = response.choices[0]?.message?.content || '';

  return {
    originalText: content,
    rewrittenText,
    examples: examples.slice(0, 5),
  };
}

/**
 * 複数チャンクを一括でリライトする
 */
export async function rewriteChunks(
  chunks: string[],
  options: RewriteOptions
): Promise<RewriteResult[]> {
  const results: RewriteResult[] = [];

  for (const chunk of chunks) {
    const result = await rewriteContent(chunk, options);
    results.push(result);
  }

  return results;
}

/**
 * リライト済みテキストを結合する
 */
export function combineRewrittenTexts(results: RewriteResult[]): string {
  return results.map((r) => r.rewrittenText).join('\n\n');
}
