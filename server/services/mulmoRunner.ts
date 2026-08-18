import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export type MulmoOutputType = 'movie' | 'audio';

export interface MulmoRunnerOptions {
  scriptPath: string;
  outputDir: string;
  outputType: MulmoOutputType;
  language?: string;
}

export interface MulmoRunnerResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
}

/**
 * MulmoCast CLIを実行して動画/音声を生成する
 */
export async function runMulmoCast(
  options: MulmoRunnerOptions
): Promise<MulmoRunnerResult> {
  const { scriptPath, outputDir, outputType, language = 'ja' } = options;

  // スクリプトファイルの存在確認
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `Script file not found: ${scriptPath}`,
    };
  }

  // 出力ディレクトリの確保
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // mulmoコマンドの構築
  const command = buildMulmoCommand(scriptPath, outputDir, outputType, language);

  console.log(`Running MulmoCast: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: outputDir,
      timeout: 10 * 60 * 1000, // 10分タイムアウト
      env: {
        ...process.env,
        // MulmoCastに必要な環境変数を確実に渡す
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });

    console.log('MulmoCast stdout:', stdout);
    if (stderr) {
      console.log('MulmoCast stderr:', stderr);
    }

    // 出力ファイルパスを特定
    const outputPath = findOutputFile(scriptPath, outputDir, outputType);

    if (outputPath && fs.existsSync(outputPath)) {
      return {
        success: true,
        outputPath,
        stdout,
        stderr,
      };
    } else {
      return {
        success: false,
        error: 'Output file not found after MulmoCast execution',
        stdout,
        stderr,
      };
    }
  } catch (error) {
    const err = error as { message?: string; stdout?: string; stderr?: string };
    console.error('MulmoCast execution error:', err);
    return {
      success: false,
      error: err.message || 'Unknown error',
      stdout: err.stdout,
      stderr: err.stderr,
    };
  }
}

/**
 * mulmoコマンドを構築する
 */
function buildMulmoCommand(
  scriptPath: string,
  outputDir: string,
  outputType: MulmoOutputType,
  language: string
): string {
  const absoluteScriptPath = path.resolve(scriptPath);
  const absoluteOutputDir = path.resolve(outputDir);

  switch (outputType) {
    case 'movie':
      // mulmo movie script.json -l ja -o outputDir
      return `mulmo movie "${absoluteScriptPath}" -l ${language} -o "${absoluteOutputDir}"`;
    case 'audio':
      // mulmo audio script.json -l ja -o outputDir
      return `mulmo audio "${absoluteScriptPath}" -l ${language} -o "${absoluteOutputDir}"`;
    default:
      return `mulmo movie "${absoluteScriptPath}" -l ${language} -o "${absoluteOutputDir}"`;
  }
}

/**
 * 生成された出力ファイルを探す
 */
function findOutputFile(
  scriptPath: string,
  outputDir: string,
  outputType: MulmoOutputType
): string | null {
  const scriptBasename = path.basename(scriptPath, '.json');
  const scriptDir = path.dirname(scriptPath);

  // MulmoCastの出力ファイル命名規則に基づいて探す
  const possibleExtensions = outputType === 'movie' ? ['.mp4'] : ['.mp3', '.wav'];
  const possibleDirs = [scriptDir, outputDir];

  for (const dir of possibleDirs) {
    for (const ext of possibleExtensions) {
      // パターン1: script.mp4 / script.mp3
      const path1 = path.join(dir, `${scriptBasename}${ext}`);
      if (fs.existsSync(path1)) return path1;

      // パターン2: script_movie.mp4 / script_audio.mp3
      const suffix = outputType === 'movie' ? '_movie' : '_audio';
      const path2 = path.join(dir, `${scriptBasename}${suffix}${ext}`);
      if (fs.existsSync(path2)) return path2;

      // パターン3: output.mp4 / output.mp3
      const path3 = path.join(dir, `output${ext}`);
      if (fs.existsSync(path3)) return path3;
    }
  }

  // 最後の手段: ディレクトリ内の最新ファイルを探す
  for (const dir of possibleDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir);
    for (const ext of possibleExtensions) {
      const matchingFiles = files
        .filter((f) => f.endsWith(ext))
        .map((f) => ({
          name: f,
          path: path.join(dir, f),
          mtime: fs.statSync(path.join(dir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (matchingFiles.length > 0) {
        return matchingFiles[0].path;
      }
    }
  }

  return null;
}

/**
 * MulmoCast CLIが利用可能かチェックする
 */
export async function checkMulmoAvailable(): Promise<boolean> {
  try {
    await execAsync('which mulmo');
    return true;
  } catch {
    return false;
  }
}

/**
 * 動画と音声の両方を生成する
 */
export async function generateVideoAndAudio(
  scriptPath: string,
  outputDir: string,
  options: { generateVideo: boolean; generateAudio: boolean }
): Promise<{
  video?: MulmoRunnerResult;
  audio?: MulmoRunnerResult;
}> {
  const results: { video?: MulmoRunnerResult; audio?: MulmoRunnerResult } = {};

  if (options.generateVideo) {
    results.video = await runMulmoCast({
      scriptPath,
      outputDir,
      outputType: 'movie',
    });
  }

  if (options.generateAudio) {
    results.audio = await runMulmoCast({
      scriptPath,
      outputDir,
      outputType: 'audio',
    });
  }

  return results;
}
