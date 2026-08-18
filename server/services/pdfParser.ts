import { createRequire } from 'module';
import fs from 'fs';

// CommonJS モジュールを ESM で読み込む
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse;

export interface ParsedPDF {
  text: string;
  numPages: number;
  chunks: string[];
}

export interface ChunkOptions {
  maxChunkSize?: number; // 最大チャンクサイズ（文字数）
  overlap?: number; // オーバーラップ文字数
}

/**
 * PDFファイルからテキストを抽出する
 */
export async function parsePDF(filePath: string): Promise<ParsedPDF> {
  const dataBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(dataBuffer);

  const parser = new PDFParse(uint8Array);
  await parser.load();
  const textResult = await parser.getText();
  const numPages = parser.doc.numPages;

  return {
    text: textResult.text,
    numPages,
    chunks: splitIntoChunks(textResult.text),
  };
}

/**
 * PDFバッファからテキストを抽出する
 */
export async function parsePDFBuffer(buffer: Buffer): Promise<ParsedPDF> {
  const uint8Array = new Uint8Array(buffer);

  const parser = new PDFParse(uint8Array);
  await parser.load();
  const textResult = await parser.getText();
  const numPages = parser.doc.numPages;

  return {
    text: textResult.text,
    numPages,
    chunks: splitIntoChunks(textResult.text),
  };
}

/**
 * テキストを意味のある単位でチャンク分割する
 */
export function splitIntoChunks(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const { maxChunkSize = 1000, overlap = 100 } = options;

  // 空行や改行で段落を分割
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // 段落が最大サイズを超える場合は文単位で分割
    if (paragraph.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > maxChunkSize) {
          if (sentenceChunk) {
            chunks.push(sentenceChunk.trim());
          }
          sentenceChunk = sentence;
        } else {
          sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
        }
      }

      if (sentenceChunk) {
        currentChunk = sentenceChunk;
      }
    } else if (currentChunk.length + paragraph.length > maxChunkSize) {
      // 現在のチャンクに追加すると超える場合
      chunks.push(currentChunk.trim());

      // オーバーラップ処理
      if (overlap > 0 && currentChunk.length > overlap) {
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    } else {
      // 現在のチャンクに追加
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // 残りのチャンクを追加
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * テキストを文単位で分割する（日本語対応）
 */
function splitIntoSentences(text: string): string[] {
  // 日本語の句点（。）と英語のピリオド（.）で分割
  const sentences = text.split(/(?<=[。．.!?！？])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * PDFのメタデータを取得する
 */
export async function getPDFMetadata(
  filePath: string
): Promise<{ title?: string; author?: string; subject?: string }> {
  const dataBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(dataBuffer);

  const parser = new PDFParse(uint8Array);
  await parser.load();
  const info = await parser.getInfo();

  return {
    title: info.info?.Title,
    author: info.info?.Author,
    subject: info.info?.Subject,
  };
}
