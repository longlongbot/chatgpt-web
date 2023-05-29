<script setup lang='ts'>
import { NCard, NTabPane, NTabs } from 'naive-ui'
import Coach from '../coach/index.vue'
import Zen from '../zen/index.vue'
import Conversation from './components/Conversation/index.vue'
</script>

<template>
  <NCard class="flex flex-col w-full h-full" style="margin-bottom: 12px;">
    <NTabs type="line" animated>
      <NTabPane name="ChatGPT" tab="ChatGPT">
        <Conversation engine="" />
      </NTabPane>
      <NTabPane name="Zen" tab="赛博禅宗">
        <Zen />
      </NTabPane>
      <NTabPane name="Coach" tab="赛博教练">
        <Coach />
      </NTabPane>
    </NTabs>
  </NCard>
</template>
