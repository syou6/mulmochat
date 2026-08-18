import type { ToolPlugin, ToolResult } from "../types";
import LearnYourWayView from "../views/LearnYourWayView.vue";
import LearnYourWayPreview from "../previews/LearnYourWayPreview.vue";

export interface LearnYourWayData {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  progressMessage: string;
  profile: {
    ageGroup: string;
    interests: string[];
    outputFormats: string[];
  };
  outputs?: {
    rewrittenText?: string;
    video?: string;
    audio?: string;
    quiz?: string;
    mindmap?: string;
    mulmoScript?: string;
  };
  error?: string;
}

export const plugin: ToolPlugin<LearnYourWayData> = {
  toolDefinition: {
    type: "function",
    name: "manabi_no_katachi",
    description:
      "まなびのカタチ - 教材PDFを学習者の年齢・興味関心に応じてリライトし、動画・音声・クイズなど複数形式に変換します。幼児教育向けの教材変換ツールです。",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "status"],
          description: "実行するアクション。openで変換画面を開く、statusでジョブ状態を確認",
        },
        jobId: {
          type: "string",
          description: "ジョブID（statusアクション時に必要）",
        },
      },
      required: ["action"],
    },
  },

  execute: async (_context, args): Promise<ToolResult<LearnYourWayData>> => {
    const { action, jobId } = args;

    if (action === "status" && jobId) {
      // ジョブ状態を確認
      try {
        const response = await fetch(`/api/v1/jobs/${jobId}`);
        const data = await response.json();

        return {
          message: `ジョブ状態: ${data.status} (${data.progress}%)`,
          title: "まなびのカタチ - 変換状態",
          data: {
            jobId: data.jobId,
            status: data.status,
            progress: data.progress,
            progressMessage: data.progressMessage,
            profile: { ageGroup: "", interests: [], outputFormats: [] },
            error: data.error,
          },
        };
      } catch (error) {
        return {
          message: "ジョブ状態の取得に失敗しました",
          title: "まなびのカタチ - エラー",
          data: {
            jobId: jobId,
            status: "failed",
            progress: 0,
            progressMessage: "エラー",
            profile: { ageGroup: "", interests: [], outputFormats: [] },
            error: error instanceof Error ? error.message : "不明なエラー",
          },
        };
      }
    }

    // 変換画面を開く
    return {
      message: "まなびのカタチ 教材変換画面を開きました。PDFをアップロードして変換を開始できます。",
      title: "まなびのカタチ - 教材変換",
      instructions:
        "ユーザーがPDFをアップロードしたら、年齢グループと興味関心を確認してください。変換が完了したら結果を説明してください。",
      data: {
        jobId: "",
        status: "pending",
        progress: 0,
        progressMessage: "PDFをアップロードしてください",
        profile: {
          ageGroup: "preschool",
          interests: ["animals"],
          outputFormats: ["video", "audio", "quiz"],
        },
      },
    };
  },

  generatingMessage: "まなびのカタチ を起動中...",
  waitingMessage: "教材を変換中...",
  uploadMessage: "PDFファイルをアップロード",

  isEnabled: () => true, // Always enabled

  viewComponent: LearnYourWayView,
  previewComponent: LearnYourWayPreview,

  fileUpload: {
    acceptedTypes: ["application/pdf"],
    handleUpload: (fileData: string, fileName: string) => {
      return {
        message: `PDFファイル "${fileName}" を受け取りました。変換設定を確認してください。`,
        title: "まなびのカタチ - PDF受信",
        data: {
          jobId: "",
          status: "pending" as const,
          progress: 0,
          progressMessage: "変換設定を確認中...",
          profile: {
            ageGroup: "preschool",
            interests: ["animals"],
            outputFormats: ["video", "audio", "quiz"],
          },
          uploadedFile: {
            name: fileName,
            data: fileData,
          },
        },
      };
    },
  },

  systemPrompt: `まなびのカタチは、教材PDFを幼児・子供向けにリライトし、動画や音声、クイズなどの形式に変換するツールです。
ユーザーが教材の変換を依頼した場合や、幼児教育向けのコンテンツ作成について話している場合は、このツールを提案してください。
年齢グループ（preschool=幼児, elementary_lower=小学校低学年, elementary_upper=小学校高学年, adult=大人）と興味関心（vehicles=乗り物, animals=動物, food=食べ物, sports=スポーツ, music=音楽）を確認してください。`,
};
