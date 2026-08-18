import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface MindmapNode {
  id: string;
  label: string;
  children?: MindmapNode[];
}

export interface MindmapResult {
  title: string;
  mermaidCode: string;
  nodes: MindmapNode;
}

/**
 * コンテンツからマインドマップを生成する
 */
export async function generateMindmap(content: string): Promise<MindmapResult> {
  const systemPrompt = `あなたは教育コンテンツの構造化の専門家です。
以下のコンテンツを分析し、主要な概念とその関係をマインドマップ形式で表現してください。

## 出力形式
以下のJSON形式で出力してください：
{
  "title": "マインドマップのタイトル",
  "nodes": {
    "id": "root",
    "label": "中心テーマ",
    "children": [
      {
        "id": "node1",
        "label": "トピック1",
        "children": [
          { "id": "node1-1", "label": "サブトピック1-1" }
        ]
      }
    ]
  }
}

## ルール
1. 階層は最大3レベルまで
2. 各レベルの項目は5つ以内
3. ラベルは簡潔に（10文字以内を推奨）
4. 主要な概念とその関連を明確に表現`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下のコンテンツからマインドマップを作成してください:\n\n${content}` },
    ],
    temperature: 0.5,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const responseText = response.choices[0]?.message?.content || '{}';

  try {
    const data = JSON.parse(responseText);
    const mermaidCode = generateMermaidCode(data.nodes);

    return {
      title: data.title || 'マインドマップ',
      mermaidCode,
      nodes: data.nodes,
    };
  } catch {
    console.error('Failed to parse mindmap response:', responseText);
    return {
      title: 'マインドマップ',
      mermaidCode: 'mindmap\n  root((エラー))',
      nodes: { id: 'root', label: 'エラー' },
    };
  }
}

/**
 * ノード構造からMermaid.jsコードを生成する
 */
function generateMermaidCode(node: MindmapNode, depth: number = 0): string {
  if (depth === 0) {
    let code = 'mindmap\n';
    code += `  root((${escapeLabel(node.label)}))\n`;

    if (node.children) {
      for (const child of node.children) {
        code += generateNodeCode(child, 2);
      }
    }

    return code;
  }

  return generateNodeCode(node, depth);
}

/**
 * 個別ノードのMermaidコードを生成
 */
function generateNodeCode(node: MindmapNode, indent: number): string {
  const spaces = '  '.repeat(indent);
  let code = `${spaces}${escapeLabel(node.label)}\n`;

  if (node.children) {
    for (const child of node.children) {
      code += generateNodeCode(child, indent + 1);
    }
  }

  return code;
}

/**
 * Mermaid用にラベルをエスケープ
 */
function escapeLabel(label: string): string {
  // 特殊文字をエスケープ
  return label
    .replace(/[()[\]{}]/g, '')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * MermaidコードをSVGに変換するためのHTML生成
 */
export function generateMermaidHtml(mermaidCode: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({startOnLoad:true});</script>
</head>
<body>
  <div class="mermaid">
${mermaidCode}
  </div>
</body>
</html>`;
}

/**
 * マインドマップをMarkdown形式でエクスポート
 */
export function exportMindmapAsMarkdown(result: MindmapResult): string {
  let markdown = `# ${result.title}\n\n`;
  markdown += '```mermaid\n';
  markdown += result.mermaidCode;
  markdown += '```\n';

  return markdown;
}
