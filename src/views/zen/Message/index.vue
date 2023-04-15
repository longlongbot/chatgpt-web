<script setup lang='ts'>
import { ref } from 'vue'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'

interface Props {
  dateTime?: string
  text?: string
  inversion?: boolean
  error?: boolean
  loading?: boolean
}


const props = defineProps<Props>()

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

</script>

<template>
  <div
    ref="messageRef"
    class="flex w-full overflow-hidden p-4"
    :class="inversion ? 'bg-[#F5F5F5]' : 'bg-[#F7FEE7]'"
  >
    <div
      class="flex items-center justify-center flex-shrink-0 h-8 overflow-hidden rounded-full basis-8 mr-2"
    >
      <AvatarComponent :image="inversion" />
    </div>
    <div class="overflow-hidden text-sm items-start">
      <div
        class="flex items-end gap-1 pt-1 flex-row"
      >
        <TextComponent
          ref="textRef"
          :inversion="false"
          :error="error"
          :text="text"
          :loading="loading"
          :as-raw-text="asRawText"
        />
      </div>
    </div>
  </div>
</template>
