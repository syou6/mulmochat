import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobOutput {
  rewrittenText?: string;
  video?: string;
  audio?: string;
  quiz?: string;
  mindmap?: string;
  mulmoScript?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  progressMessage: string;
  outputs: JobOutput;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    processingTimeSeconds?: number;
    tokenUsage?: { input: number; output: number };
  };
}

// インメモリジョブストア（MVP用）
const jobs: Map<string, Job> = new Map();

/**
 * 新しいジョブを作成
 */
export function createJob(): Job {
  const job: Job = {
    id: uuidv4(),
    status: 'pending',
    progress: 0,
    progressMessage: 'ジョブを初期化中...',
    outputs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobs.set(job.id, job);
  return job;
}

/**
 * ジョブを取得
 */
export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

/**
 * ジョブを更新
 */
export function updateJob(
  jobId: string,
  updates: Partial<Omit<Job, 'id' | 'createdAt'>>
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  Object.assign(job, updates, { updatedAt: new Date() });
  jobs.set(jobId, job);
  return job;
}

/**
 * ジョブの進捗を更新
 */
export function updateJobProgress(
  jobId: string,
  progress: number,
  message: string
): void {
  updateJob(jobId, {
    progress: Math.min(100, Math.max(0, progress)),
    progressMessage: message,
  });
}

/**
 * ジョブを完了としてマーク
 */
export function completeJob(jobId: string, outputs: JobOutput): void {
  const job = getJob(jobId);
  if (!job) return;

  const processingTime = (new Date().getTime() - job.createdAt.getTime()) / 1000;

  updateJob(jobId, {
    status: 'completed',
    progress: 100,
    progressMessage: '完了しました',
    outputs,
    metadata: {
      ...job.metadata,
      processingTimeSeconds: processingTime,
    },
  });
}

/**
 * ジョブを失敗としてマーク
 */
export function failJob(jobId: string, error: string): void {
  updateJob(jobId, {
    status: 'failed',
    progressMessage: 'エラーが発生しました',
    error,
  });
}

/**
 * ジョブを削除
 */
export function deleteJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

/**
 * 全ジョブを取得
 */
export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * 古いジョブをクリーンアップ（1時間以上前のジョブを削除）
 */
export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt.getTime() > maxAgeMs) {
      jobs.delete(id);
    }
  }
}
