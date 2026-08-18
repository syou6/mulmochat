<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { LearnYourWayData } from "../models/learnYourWay";

const props = defineProps<{
  data?: LearnYourWayData & { uploadedFile?: { name: string; data: string } };
}>();

const emit = defineEmits<{
  (e: "update", data: LearnYourWayData): void;
}>();

// フォーム状態
const ageGroup = ref(props.data?.profile?.ageGroup || "preschool");
const interests = ref<string[]>(props.data?.profile?.interests || ["animals"]);
const outputFormats = ref<string[]>(
  props.data?.profile?.outputFormats || ["video", "audio", "quiz"]
);
const videoStyle = ref("ghibli");
const voiceId = ref("nova");
const quizCount = ref(5);

// ファイル状態
const selectedFile = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// ジョブ状態
const jobId = ref(props.data?.jobId || "");
const status = ref(props.data?.status || "pending");
const progress = ref(props.data?.progress || 0);
const progressMessage = ref(props.data?.progressMessage || "");
const outputs = ref(props.data?.outputs || {});
const error = ref(props.data?.error || "");

// ポーリング
let pollInterval: ReturnType<typeof setInterval> | null = null;

const isProcessing = computed(
  () => status.value === "pending" || status.value === "processing"
);
const isCompleted = computed(() => status.value === "completed");
const isFailed = computed(() => status.value === "failed");

const ageGroupOptions = [
  { value: "preschool", label: "幼児（3〜6歳）" },
  { value: "elementary_lower", label: "小学校低学年（1〜3年生）" },
  { value: "elementary_upper", label: "小学校高学年（4〜6年生）" },
  { value: "adult", label: "大人・保育者" },
];

const interestOptions = [
  { value: "vehicles", label: "🚗 乗り物" },
  { value: "animals", label: "🐾 動物" },
  { value: "food", label: "🍎 食べ物" },
  { value: "sports", label: "⚽ スポーツ" },
  { value: "music", label: "🎵 音楽" },
  { value: "nature", label: "🌿 自然" },
  { value: "space", label: "🚀 宇宙" },
  { value: "art", label: "🎨 アート" },
];

const outputFormatOptions = [
  { value: "video", label: "📹 動画" },
  { value: "audio", label: "🎧 音声" },
  { value: "quiz", label: "❓ クイズ" },
  { value: "mindmap", label: "🗺️ マインドマップ" },
];

const toggleInterest = (value: string) => {
  const index = interests.value.indexOf(value);
  if (index === -1) {
    interests.value.push(value);
  } else {
    interests.value.splice(index, 1);
  }
};

const toggleOutputFormat = (value: string) => {
  const index = outputFormats.value.indexOf(value);
  if (index === -1) {
    outputFormats.value.push(value);
  } else {
    outputFormats.value.splice(index, 1);
  }
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
  }
};

const startTransform = async () => {
  if (!selectedFile.value && !props.data?.uploadedFile) {
    alert("PDFファイルを選択してください");
    return;
  }

  if (interests.value.length === 0) {
    alert("興味関心を1つ以上選択してください");
    return;
  }

  if (outputFormats.value.length === 0) {
    alert("出力形式を1つ以上選択してください");
    return;
  }

  status.value = "processing";
  progressMessage.value = "変換を開始しています...";

  try {
    const formData = new FormData();

    if (selectedFile.value) {
      formData.append("file", selectedFile.value);
    } else if (props.data?.uploadedFile) {
      // Base64からBlobに変換
      const byteString = atob(props.data.uploadedFile.data.split(",")[1] || props.data.uploadedFile.data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: "application/pdf" });
      formData.append("file", blob, props.data.uploadedFile.name);
    }

    formData.append(
      "profile",
      JSON.stringify({
        ageGroup: ageGroup.value,
        interests: interests.value,
        outputFormats: outputFormats.value,
      })
    );

    formData.append(
      "options",
      JSON.stringify({
        videoStyle: videoStyle.value,
        voiceId: voiceId.value,
        quizCount: quizCount.value,
      })
    );

    const response = await fetch("/api/v1/transform", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.jobId) {
      jobId.value = result.jobId;
      startPolling();
    } else {
      throw new Error(result.error || "ジョブの作成に失敗しました");
    }
  } catch (err) {
    status.value = "failed";
    error.value = err instanceof Error ? err.message : "不明なエラー";
    progressMessage.value = "エラーが発生しました";
  }
};

const pollJobStatus = async () => {
  if (!jobId.value) return;

  try {
    const response = await fetch(`/api/v1/jobs/${jobId.value}`);
    const data = await response.json();

    status.value = data.status;
    progress.value = data.progress;
    progressMessage.value = data.progressMessage;
    error.value = data.error || "";

    if (data.status === "completed") {
      stopPolling();
      await fetchOutputs();
    } else if (data.status === "failed") {
      stopPolling();
    }

    emit("update", {
      jobId: jobId.value,
      status: status.value,
      progress: progress.value,
      progressMessage: progressMessage.value,
      profile: {
        ageGroup: ageGroup.value,
        interests: interests.value,
        outputFormats: outputFormats.value,
      },
      outputs: outputs.value,
      error: error.value,
    });
  } catch (err) {
    console.error("Failed to poll job status:", err);
  }
};

const fetchOutputs = async () => {
  if (!jobId.value) return;

  try {
    const response = await fetch(`/api/v1/jobs/${jobId.value}/outputs`);
    const data = await response.json();
    outputs.value = data.outputs || {};
  } catch (err) {
    console.error("Failed to fetch outputs:", err);
  }
};

const startPolling = () => {
  if (pollInterval) return;
  pollInterval = setInterval(pollJobStatus, 2000);
};

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

onMounted(() => {
  if (jobId.value && isProcessing.value) {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="learn-your-way-view p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">まなびのカタチ - 教材変換</h1>

    <!-- ファイルアップロード -->
    <div class="mb-6 p-4 border rounded-lg bg-gray-50">
      <h2 class="text-lg font-semibold mb-3">1. PDFファイル</h2>
      <div v-if="props.data?.uploadedFile" class="mb-2 text-green-600">
        アップロード済み: {{ props.data.uploadedFile.name }}
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept=".pdf"
        @change="handleFileSelect"
        class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        :disabled="isProcessing"
      />
    </div>

    <!-- 年齢グループ選択 -->
    <div class="mb-6 p-4 border rounded-lg bg-gray-50">
      <h2 class="text-lg font-semibold mb-3">2. 対象年齢</h2>
      <select
        v-model="ageGroup"
        class="w-full p-2 border rounded"
        :disabled="isProcessing"
      >
        <option v-for="opt in ageGroupOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- 興味関心選択 -->
    <div class="mb-6 p-4 border rounded-lg bg-gray-50">
      <h2 class="text-lg font-semibold mb-3">3. 興味関心（複数選択可）</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="opt in interestOptions"
          :key="opt.value"
          @click="toggleInterest(opt.value)"
          :class="[
            'px-4 py-2 rounded-full text-sm transition-colors',
            interests.includes(opt.value)
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          ]"
          :disabled="isProcessing"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 出力形式選択 -->
    <div class="mb-6 p-4 border rounded-lg bg-gray-50">
      <h2 class="text-lg font-semibold mb-3">4. 出力形式（複数選択可）</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="opt in outputFormatOptions"
          :key="opt.value"
          @click="toggleOutputFormat(opt.value)"
          :class="[
            'px-4 py-2 rounded-full text-sm transition-colors',
            outputFormats.includes(opt.value)
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          ]"
          :disabled="isProcessing"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 変換開始ボタン -->
    <div class="mb-6">
      <button
        @click="startTransform"
        :disabled="isProcessing"
        :class="[
          'w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors',
          isProcessing
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700',
        ]"
      >
        {{ isProcessing ? "変換中..." : "変換を開始" }}
      </button>
    </div>

    <!-- 進捗表示 -->
    <div v-if="isProcessing || isCompleted || isFailed" class="mb-6 p-4 border rounded-lg">
      <h2 class="text-lg font-semibold mb-3">進捗状況</h2>
      <div class="mb-2">
        <div class="flex justify-between text-sm mb-1">
          <span>{{ progressMessage }}</span>
          <span>{{ progress }}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all"
            :class="isFailed ? 'bg-red-500' : 'bg-blue-500'"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>
      <div v-if="error" class="text-red-600 text-sm mt-2">
        エラー: {{ error }}
      </div>
    </div>

    <!-- 出力結果 -->
    <div v-if="isCompleted && outputs" class="p-4 border rounded-lg bg-green-50">
      <h2 class="text-lg font-semibold mb-3 text-green-700">変換完了</h2>
      <ul class="space-y-2">
        <li v-if="outputs.rewrittenText" class="flex items-center">
          <span class="mr-2">📝</span>
          <a :href="outputs.rewrittenText" target="_blank" class="text-blue-600 hover:underline">
            リライトテキスト
          </a>
        </li>
        <li v-if="outputs.quiz" class="flex items-center">
          <span class="mr-2">❓</span>
          <a :href="outputs.quiz" target="_blank" class="text-blue-600 hover:underline">
            クイズ
          </a>
        </li>
        <li v-if="outputs.mindmap" class="flex items-center">
          <span class="mr-2">🗺️</span>
          <a :href="outputs.mindmap" target="_blank" class="text-blue-600 hover:underline">
            マインドマップ
          </a>
        </li>
        <li v-if="outputs.mulmoScript" class="flex items-center">
          <span class="mr-2">🎬</span>
          <a :href="outputs.mulmoScript" target="_blank" class="text-blue-600 hover:underline">
            MulmoScript
          </a>
        </li>
      </ul>
      <p class="mt-4 text-sm text-gray-600">
        動画生成: <code class="bg-gray-200 px-1 rounded">npx mulmo movie {{ outputs.mulmoScript }}</code>
      </p>
    </div>
  </div>
</template>

<style scoped>
.learn-your-way-view {
  font-family: sans-serif;
}
</style>
