import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parsePDFBuffer } from '../services/pdfParser';
import { rewriteContent, combineRewrittenTexts, type AgeGroup, type Interest } from '../services/rewriter';
import { generateQuiz, exportQuizAsJson } from '../services/quizGenerator';
import { generateMindmap, exportMindmapAsMarkdown } from '../services/mindmapGenerator';
import {
  generateMulmoScript,
  exportMulmoScriptAsJson,
  type VideoStyle,
  type VoiceId,
} from '../services/mulmoScriptGenerator';
import {
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  deleteJob,
  getAllJobs,
} from '../services/jobManager';
import {
  runMulmoCast,
  checkMulmoAvailable,
} from '../services/mulmoRunner';

const router = Router();

// ファイルアップロード設定
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('PDFファイルのみアップロード可能です'));
    }
  },
});

// 出力ディレクトリ
const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';

// 出力ディレクトリを確保
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface TransformRequest {
  ageGroup: AgeGroup;
  interests: Interest[];
  outputFormats: string[];
  videoStyle: VideoStyle;
  voiceId: VoiceId;
  quizCount: number;
}

/**
 * POST /api/v1/transform - 教材変換ジョブを作成
 */
router.post(
  '/transform',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'PDFファイルが必要です' });
        return;
      }

      // リクエストボディをパース
      const profile: TransformRequest = JSON.parse(req.body.profile || '{}');
      const options = JSON.parse(req.body.options || '{}');

      const {
        ageGroup = 'preschool',
        interests = ['animals'],
        outputFormats = ['video', 'audio', 'quiz'],
      } = profile;

      const {
        videoStyle = process.env.DEFAULT_VIDEO_STYLE || 'ghibli',
        voiceId = process.env.DEFAULT_VOICE_ID || 'nova',
        quizCount = 5,
      } = options;

      // ジョブを作成
      const job = createJob();

      // 非同期で処理を開始
      processTransformJob(
        job.id,
        req.file.buffer,
        {
          ageGroup,
          interests,
          outputFormats,
          videoStyle: videoStyle as VideoStyle,
          voiceId: voiceId as VoiceId,
          quizCount,
        }
      );

      res.status(202).json({
        jobId: job.id,
        status: job.status,
        message: '変換ジョブを開始しました',
      });
    } catch (error) {
      console.error('Transform error:', error);
      res.status(500).json({ error: '変換の開始に失敗しました' });
    }
  }
);

/**
 * GET /api/v1/jobs/:jobId - ジョブ状態を取得
 */
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'ジョブが見つかりません' });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    progressMessage: job.progressMessage,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

/**
 * GET /api/v1/jobs/:jobId/outputs - 生成ファイル一覧を取得
 */
router.get('/jobs/:jobId/outputs', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'ジョブが見つかりません' });
    return;
  }

  if (job.status !== 'completed') {
    res.status(400).json({
      error: 'ジョブがまだ完了していません',
      status: job.status,
      progress: job.progress,
    });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    outputs: job.outputs,
    metadata: job.metadata,
  });
});

/**
 * DELETE /api/v1/jobs/:jobId - ジョブをキャンセル/削除
 */
router.delete('/jobs/:jobId', (req: Request, res: Response) => {
  const deleted = deleteJob(req.params.jobId);

  if (!deleted) {
    res.status(404).json({ error: 'ジョブが見つかりません' });
    return;
  }

  res.json({ message: 'ジョブを削除しました' });
});

/**
 * GET /api/v1/jobs - 全ジョブを取得
 */
router.get('/jobs', (_req: Request, res: Response) => {
  const jobs = getAllJobs();
  res.json({ jobs });
});

/**
 * 変換ジョブを処理する非同期関数
 */
async function processTransformJob(
  jobId: string,
  pdfBuffer: Buffer,
  options: TransformRequest
): Promise<void> {
  const {
    ageGroup,
    interests,
    outputFormats,
    videoStyle,
    voiceId,
    quizCount,
  } = options;

  try {
    // 1. PDF解析 (10%)
    updateJobProgress(jobId, 5, 'PDFを解析中...');
    const parsed = await parsePDFBuffer(pdfBuffer);
    updateJobProgress(jobId, 10, `PDFを解析しました（${parsed.numPages}ページ）`);

    // 2. コンテンツリライト (40%)
    updateJobProgress(jobId, 15, 'コンテンツをリライト中...');
    const rewriteResults = [];
    for (let i = 0; i < parsed.chunks.length; i++) {
      const chunk = parsed.chunks[i] ?? '';
      const result = await rewriteContent(chunk, { ageGroup, interests });
      rewriteResults.push(result);
      const progress = 15 + Math.floor((i / parsed.chunks.length) * 25);
      updateJobProgress(jobId, progress, `リライト中... (${i + 1}/${parsed.chunks.length})`);
    }
    const rewrittenText = combineRewrittenTexts(rewriteResults);
    updateJobProgress(jobId, 40, 'リライトが完了しました');

    // ジョブ出力ディレクトリを作成
    const jobOutputDir = path.join(OUTPUT_DIR, jobId);
    if (!fs.existsSync(jobOutputDir)) {
      fs.mkdirSync(jobOutputDir, { recursive: true });
    }

    // リライトテキストを保存
    const rewrittenTextPath = path.join(jobOutputDir, 'rewritten.md');
    fs.writeFileSync(rewrittenTextPath, rewrittenText);

    const outputs: Record<string, string> = {
      rewrittenText: rewrittenTextPath,
    };

    // 3. クイズ生成 (50%)
    if (outputFormats.includes('quiz')) {
      updateJobProgress(jobId, 45, 'クイズを生成中...');
      const quiz = await generateQuiz(rewrittenText, {
        ageGroup,
        count: quizCount,
      });
      const quizPath = path.join(jobOutputDir, 'quiz.json');
      fs.writeFileSync(quizPath, exportQuizAsJson(quiz));
      outputs.quiz = quizPath;
      updateJobProgress(jobId, 50, 'クイズを生成しました');
    }

    // 4. マインドマップ生成 (60%)
    if (outputFormats.includes('mindmap')) {
      updateJobProgress(jobId, 55, 'マインドマップを生成中...');
      const mindmap = await generateMindmap(rewrittenText);
      const mindmapPath = path.join(jobOutputDir, 'mindmap.md');
      fs.writeFileSync(mindmapPath, exportMindmapAsMarkdown(mindmap));
      outputs.mindmap = mindmapPath;
      updateJobProgress(jobId, 60, 'マインドマップを生成しました');
    }

    // 5. MulmoScript生成 (70%)
    if (outputFormats.includes('video') || outputFormats.includes('audio')) {
      updateJobProgress(jobId, 65, 'MulmoScriptを生成中...');
      const mulmoScript = await generateMulmoScript(rewrittenText, {
        ageGroup,
        videoStyle,
        voiceId,
      });
      const scriptPath = path.join(jobOutputDir, 'script.json');
      fs.writeFileSync(scriptPath, exportMulmoScriptAsJson(mulmoScript));
      outputs.mulmoScript = scriptPath;
      updateJobProgress(jobId, 70, 'MulmoScriptを生成しました');

      // MulmoCast CLIの利用可能性チェック
      const mulmoAvailable = await checkMulmoAvailable();

      if (mulmoAvailable) {
        // 6. 動画生成 (85%)
        if (outputFormats.includes('video')) {
          updateJobProgress(jobId, 75, '動画を生成中...（数分かかります）');
          const videoResult = await runMulmoCast({
            scriptPath,
            outputDir: jobOutputDir,
            outputType: 'movie',
          });

          if (videoResult.success && videoResult.outputPath) {
            outputs.video = videoResult.outputPath;
            updateJobProgress(jobId, 85, '動画を生成しました');
          } else {
            console.error('Video generation failed:', videoResult.error);
            // 動画生成失敗してもジョブは続行
            outputs.video = `生成失敗: ${videoResult.error || '不明なエラー'}`;
          }
        }

        // 7. 音声生成 (95%)
        if (outputFormats.includes('audio')) {
          updateJobProgress(jobId, 90, '音声を生成中...');
          const audioResult = await runMulmoCast({
            scriptPath,
            outputDir: jobOutputDir,
            outputType: 'audio',
          });

          if (audioResult.success && audioResult.outputPath) {
            outputs.audio = audioResult.outputPath;
            updateJobProgress(jobId, 95, '音声を生成しました');
          } else {
            console.error('Audio generation failed:', audioResult.error);
            outputs.audio = `生成失敗: ${audioResult.error || '不明なエラー'}`;
          }
        }
      } else {
        // MulmoCast CLIが利用不可の場合
        console.warn('MulmoCast CLI not available, skipping media generation');
        if (outputFormats.includes('video')) {
          outputs.video = `${scriptPath} (mulmo movie "${scriptPath}" で動画生成可能)`;
        }
        if (outputFormats.includes('audio')) {
          outputs.audio = `${scriptPath} (mulmo audio "${scriptPath}" で音声生成可能)`;
        }
      }
    }

    // 6. 完了
    completeJob(jobId, outputs);
  } catch (error) {
    console.error('Job processing error:', error);
    failJob(jobId, error instanceof Error ? error.message : '不明なエラー');
  }
}

export default router;
