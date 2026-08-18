<script setup lang="ts">
import { computed } from "vue";
import type { LearnYourWayData } from "../models/learnYourWay";

const props = defineProps<{
  data?: LearnYourWayData;
}>();

const statusIcon = computed(() => {
  if (!props.data) return "📚";
  switch (props.data.status) {
    case "pending":
      return "⏳";
    case "processing":
      return "⚙️";
    case "completed":
      return "✅";
    case "failed":
      return "❌";
    default:
      return "📚";
  }
});

const statusText = computed(() => {
  if (!props.data) return "準備中";
  switch (props.data.status) {
    case "pending":
      return "待機中";
    case "processing":
      return `${props.data.progress || 0}%`;
    case "completed":
      return "完了";
    case "failed":
      return "エラー";
    default:
      return "準備中";
  }
});

const ageGroupLabel = computed(() => {
  if (!props.data?.profile?.ageGroup) return "";
  const labels: Record<string, string> = {
    preschool: "幼児",
    elementary_lower: "小学低",
    elementary_upper: "小学高",
    adult: "大人",
  };
  return labels[props.data.profile.ageGroup] || "";
});

const interests = computed(() => {
  return props.data?.profile?.interests || [];
});

const progress = computed(() => {
  return props.data?.progress || 0;
});

const outputs = computed(() => {
  return props.data?.outputs;
});

const status = computed(() => {
  return props.data?.status;
});
</script>

<template>
  <div class="learn-your-way-preview p-3 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
    <div class="flex items-center justify-between mb-2">
      <span class="text-2xl">{{ statusIcon }}</span>
      <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
        {{ statusText }}
      </span>
    </div>

    <div class="text-sm font-medium text-gray-800 mb-1">
      まなびのカタチ
    </div>

    <div v-if="ageGroupLabel" class="text-xs text-gray-600 mb-1">
      対象: {{ ageGroupLabel }}
    </div>

    <div v-if="interests.length" class="flex flex-wrap gap-1">
      <span
        v-for="interest in interests.slice(0, 3)"
        :key="interest"
        class="text-xs bg-gray-200 px-1 rounded"
      >
        {{ interest }}
      </span>
      <span v-if="interests.length > 3" class="text-xs text-gray-500">
        +{{ interests.length - 3 }}
      </span>
    </div>

    <!-- 進捗バー -->
    <div v-if="status === 'processing'" class="mt-2">
      <div class="w-full bg-gray-200 rounded-full h-1">
        <div
          class="bg-blue-500 h-1 rounded-full transition-all"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
    </div>

    <!-- 完了時の出力数 -->
    <div v-if="status === 'completed' && outputs" class="mt-2 text-xs text-green-600">
      {{ Object.keys(outputs).length }} ファイル生成済み
    </div>
  </div>
</template>

<style scoped>
.learn-your-way-preview {
  min-height: 80px;
}
</style>
