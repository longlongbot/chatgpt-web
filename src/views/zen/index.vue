<script setup lang='ts'>
import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { NAutoComplete, NButton, NInput, useDialog } from 'naive-ui'
import { useScroll } from '../chat/hooks/useScroll'
import { useChat } from '../chat/hooks/useChat'
import { useCopyCode } from '../chat/hooks/useCopyCode'
import { useUsingContext } from '../chat/hooks/useUsingContext'
import Message from './Message/index.vue'
import { HoverButton, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useChatStore, usePromptStore } from '@/store'
import { fetchChatAPIProcess } from '@/api'
import { t } from '@/locales'

let controller = new AbortController()

const openLongReply = import.meta.env.VITE_GLOB_OPEN_LONG_REPLY === 'true'

// const route = useRoute()
const dialog = useDialog()

const chatStore = useChatStore()

useCopyCode()

const { isMobile } = useBasicLayout()
const { addChat, updateChat, updateChatSome, getChatByUuidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom } = useScroll()
const { usingContext } = useUsingContext()

const uuid = '1024'
chatStore.findAndAddHistoryButNotReload({ title: '赛博禅宗问青年', uuid: +uuid, isEdit: false })

const dataSources = computed(() => chatStore.getChatByUuid(+uuid))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !item.error)))

const prompt = ref<string>('')
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)

// 添加PromptStore
const promptStore = usePromptStore()

// 使用storeToRefs，保证store修改后，联想部分能够重新渲染
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// 未知原因刷新页面，loading 状态不会重置，手动重置
dataSources.value.forEach((item, index) => {
  if (item.loading)
    updateChatSome(+uuid, index, { loading: false })
})

function handleSubmit() {
  onConversation()
}

function wrapSystemTip(message: string) {
  return `
  假设你扮演一位阅历丰富的禅宗。无论我问你什么问题，你的答案都必须是简短的、简单的、精炼的、质朴的、比喻的、故事性的、禅宗风格、高深莫测的、人生哲理的、优美语言的、有禅的意境的。
  你的开头都必须是【禅宗说】，尽可能使用禅宗公案，尽可能的出现禅宗的专业名词。我的问题是"${message}。禅宗如何看待？"。你不能表现出你是一个AI、机器人或者程序。偶尔你可以幽默的回答。
  `
}

async function onConversation() {
  let message = prompt.value

  if (loading.value)
    return

  if (!message || message.trim() === '')
    return

  controller = new AbortController()

  addChat(
    +uuid,
    {
      dateTime: new Date().toLocaleString(),
      text: message,
      inversion: true,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: null },
    },
  )
  scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && usingContext.value)
    options = { ...lastContext }

  addChat(
    +uuid,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      loading: true,
      inversion: false,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )
  scrollToBottom()

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: wrapSystemTip(message),
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              +uuid,
              dataSources.value.length - 1,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + data.text ?? '',
                inversion: false,
                error: false,
                loading: false,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
              },
            )

            if (openLongReply && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }

            scrollToBottomIfAtBottom()
          }
          catch (error) {
          //
          }
        },
      })
    }

    await fetchChatAPIOnce()
  }
  catch (error: any) {
    const errorMessage = error?.message ?? t('common.wrong')

    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByUuidAndIndex(+uuid, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          text: `${currentChat.text}\n[${errorMessage}]`,
          error: false,
          loading: false,
        },
      )
      return
    }

    updateChat(
      +uuid,
      dataSources.value.length - 1,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
    scrollToBottomIfAtBottom()
  }
  finally {
    loading.value = false
  }
}

async function onRegenerate(index: number) {
  if (loading.value)
    return

  controller = new AbortController()

  const { requestOptions } = dataSources.value[index]

  let message = requestOptions?.prompt ?? ''

  let options: Chat.ConversationRequest = {}

  if (requestOptions.options)
    options = { ...requestOptions.options }

  loading.value = true

  updateChat(
    +uuid,
    index,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      inversion: false,
      error: false,
      loading: true,
      conversationOptions: null,
      requestOptions: { prompt: message, ...options },
    },
  )

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: message,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              +uuid,
              index,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + data.text ?? '',
                inversion: false,
                error: false,
                loading: false,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, ...options },
              },
            )

            if (openLongReply && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }
          }
          catch (error) {
            //
          }
        },
      })
    }
    await fetchChatAPIOnce()
  }
  catch (error: any) {
    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error?.message ?? t('common.wrong')

    updateChat(
      +uuid,
      index,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, ...options },
      },
    )
  }
  finally {
    loading.value = false
  }
}

function handleDelete(index: number) {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.deleteChatByUuid(+uuid, index)
    },
  })
}

function handleClear() {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.clearChat'),
    content: t('chat.clearChatConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearChatByUuid(+uuid)
    },
  })
}

function handleEnter(event: KeyboardEvent) {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
  else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

function handleStop() {
  if (loading.value) {
    controller.abort()
    loading.value = false
  }
}

// 可优化部分
// 搜索选项计算，这里使用value作为索引项，所以当出现重复value时渲染异常(多项同时出现选中效果)
// 理想状态下其实应该是key作为索引项,但官方的renderOption会出现问题，所以就需要value反renderLabel实现
const searchOptions = computed(() => {
  if (prompt.value.startsWith('/')) {
    return promptTemplate.value.filter((item: { key: string }) => item.key.toLowerCase().includes(prompt.value.substring(1).toLowerCase())).map((obj: { value: any }) => {
      return {
        label: obj.value,
        value: obj.value,
      }
    })
  }
  else {
    return []
  }
})

// value反渲染key
const renderOption = (option: { label: string }) => {
  for (const i of promptTemplate.value) {
    if (i.value === option.label)
      return [i.key]
  }
  return []
}

const placeholder = computed(() => {
  return '诉说你的苦恼，追寻人生的意义'
})

const buttonDisabled = computed(() => {
  return loading.value || !prompt.value || prompt.value.trim() === ''
})

const footerClass = computed(() => {
  let classes = ['p-4']
  if (isMobile.value)
    classes = ['sticky', 'left-0', 'bottom-0', 'right-0', 'p-2', 'pr-3', 'overflow-hidden']
  return classes
})

onMounted(() => {
  scrollToBottom()
  if (inputRef.value && !isMobile.value)
    inputRef.value?.focus()
})

onUnmounted(() => {
  if (loading.value)
    controller.abort()
})
</script>

<template>
  <div class="flex flex-col max-w-2xl mx-auto h-full bg-gray-50">
    <div class="p-5 bg-gray-100">
      <svg t="1678542002858" class="icon float-left" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2324" width="60" height="60"><path d="M511.997637 2.142564C229.818192 2.142564 1.065022 230.895734 1.065022 513.075179a510.932615 510.932615 0 0 0 480.147352 509.955304l1.854383 0.100237a511.007792 511.007792 0 0 0 284.422246-67.659917q18.5313-10.687761 35.922405-22.778839c1.741616-1.252961 3.483233-2.430745 5.212319-3.671177l2.806634-2.017268 0.200474-0.137826a510.945144 510.945144 0 0 0 211.299417-413.790514C1022.930252 230.895734 794.189612 2.142564 511.997637 2.142564z" fill="#F5D762" p-id="2325" /><path d="M298.242416 305.634883m161.606966 0l102.755367 0q161.606966 0 161.606966 161.606966l0 5.061965q0 161.606966-161.606966 161.606966l-102.755367 0q-161.606966 0-161.606966-161.606966l0-5.061965q0-161.606966 161.606966-161.606966Z" fill="#7F6152" p-id="2326" /><path d="M603.238289 1015.901133a518.300028 518.300028 0 0 1-182.481304 0V774.229931H603.238289z m0 0" fill="#FCE9E9" p-id="2327" /><path d="M603.238289 778.001345H420.807103v70.16584c19.15778 18.794422 52.62438 31.324036 90.66429 31.324036a158.22397 158.22397 0 0 0 48.364311-7.304765l-76.768947 150.981853a509.955305 509.955305 0 0 0 120.171532-7.392472v-166.643871l-1.252962-1.027429 1.252962-1.252961z" fill="#FAD5D5" p-id="2328" /><path d="M214.669888 928.657428L420.807103 848.367659l33.829959 172.445083a508.376573 508.376573 0 0 1-239.854408-92.155314z" fill="#FCE9E9" p-id="2329" /><path d="M569.245445 1020.812742l33.992844-172.445083 206.074567 80.289769a509.115821 509.115821 0 0 1-240.067411 92.155314z" fill="#FAD5D5" p-id="2330" /><path d="M603.238289 827.844151l-122.025915 195.223921a510.732141 510.732141 0 0 0 286.25157-67.522091q18.5313-10.687761 35.922405-22.778839c1.741616-1.252961 3.483233-2.430745 5.212319-3.671177l2.806634-2.017268 0.200474-0.137826z" fill="#E3B765" p-id="2331" /><path d="M300.084269 530.629168c-5.362675-144.842342 94.335467-225.207289 211.750483-225.207288 116.888772 0 216.373911 80.790953 211.750483 221.987178 6.953936-4.109714 17.378575-9.10903 29.444593-2.505923 14.546882 7.943776 15.223481 78.021909-5.149671 121.762792a65.31688 65.31688 0 0 0-6.064333 22.678602c-4.397895 58.889188-7.981364 108.030335-21.989474 108.030335-15.035537 0-13.63222-106.025597-13.544513-106.263659-38.00232 101.489876-116.96395 168.022129-194.2842 168.022128-77.896613 0-146.283248-57.448282-188.244926-152.861295-0.676599 0.3383-5.287497 97.104511-17.817112 97.104511-11.577364 0-13.920402-61.958943-14.208583-112.0774a33.278656 33.278656 0 0 0-6.390103-19.546198c-28.003688-38.177735-34.055492-120.823071-16.940039-126.436339a34.556676 34.556676 0 0 1 31.687395 5.312556z" fill="#F9E3E6" p-id="2332" /><path d="M494.894713 486.875755a17.102924 17.102924 0 1 0 8.607845-14.810004 17.115453 17.115453 0 0 0-8.545197 14.810004z m0 0M511.822222 758.831035c19.846909 0 35.934934-6.477811 35.934934-14.446645H475.937407c0 7.968835 16.050436 14.446645 35.884815 14.446645z" fill="#D16279" p-id="2333" /><path d="M275.150336 554.197373a11.026061 11.026061 0 0 1 17.428694-8.495078c3.946829 2.9194 6.953936 7.580417 8.13172 16.163202 2.505923 18.167941-2.505923 30.346726-2.505923 30.346726a70.679555 70.679555 0 0 1 9.397211 26.663019 112.766529 112.766529 0 0 1 0 27.565152s-26.31219-16.188262-30.697556-53.513983a236.133112 236.133112 0 0 1-1.754146-38.729038zM748.656993 554.197373c-0.413477-8.77073-10.39958-13.694869-17.416164-8.495078-3.959358 2.9194-6.953936 7.580417-8.144249 16.163202-2.505923 18.167941 2.505923 30.346726 2.505923 30.346726a70.679555 70.679555 0 0 0-9.397211 26.663019 112.766529 112.766529 0 0 0 0 27.565152s26.31219-16.188262 30.697555-53.513983a236.133112 236.133112 0 0 0 1.754146-38.729038z" fill="#F2B2B1" p-id="2334" /><path d="M724.211715 480.109763v48.865496a115.360159 115.360159 0 0 0-110.035073-80.678187H409.167092a115.272452 115.272452 0 0 0-110.924676 83.685295v-51.872604c0-97.492929 80.628068-177.268984 179.173485-177.268984h67.659918c98.507828 0 179.135897 79.776055 179.135896 177.268984z" fill="#7F6152" p-id="2335" /><path d="M440.228006 231.847984m54.215641 0l33.566837 0q54.215641 0 54.215641 54.215642l0 11.853015q0 54.215641-54.215641 54.215641l-33.566837 0q-54.215641 0-54.215641-54.215641l0-11.853015q0-54.215641 54.215641-54.215642Z" fill="#7F6152" p-id="2336" /><path d="M605.192908 582.952838c-16.288499 0-32.990475 14.62206-32.990474 14.62206l69.752363-2.092446s-20.47339-12.529614-36.761889-12.529614zM380.499334 595.482452l69.752363 2.092446s-16.714506-14.62206-33.003004-14.62206-36.749359 12.529614-36.749359 12.529614z" fill="#262626" p-id="2337" /><path d="M518.525566 597.574898v91.466185l19.195369-4.786313-19.195369-86.679872z" fill="#F2B2B1" p-id="2338" /><path d="M665.347587 538.898714c-21.300344 0-83.321936-4.899079-102.116357 10.136458M362.506808 538.898714c21.300344 0 83.321936-4.899079 102.116357 10.136458" fill="#262626" p-id="2339" /></svg>

      <h2 class="float-left m-5">
        <span class="text-2xl font-extrabold mr-1">赛博禅宗，</span>
        <span class="text-2xl text-transparent font-extrabold bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 via-brown-500 to-brown-600">在线解忧</span>
      </h2>
    </div>
    <div class="clear-right" />
    <main class="overflow-hidden">
      <div
        id="scrollRef"
        ref="scrollRef"
        class="h-full overflow-hidden overflow-y-auto"
      >
        <div
          id="image-wrapper"
          class="w-full max-w-screen-xl m-auto dark:bg-[#101014]"
        >
          <div>
            <Message
              v-for="(item, index) of dataSources"
              :key="index"
              :date-time="item.dateTime"
              :text="item.text"
              :inversion="item.inversion"
              :error="item.error"
              :loading="item.loading"
              @regenerate="onRegenerate(index)"
              @delete="handleDelete(index)"
            />
            <div class="sticky bottom-0 left-0 flex justify-center">
              <NButton v-if="false" type="warning" @click="handleStop">
                <template #icon>
                  <SvgIcon icon="ri:stop-circle-line" />
                </template>
                Stop Responding
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </main>
    <footer :class="footerClass">
      <div class="w-full max-w-screen-xl m-auto">
        <div v-if="!loading" class="flex items-center justify-between space-x-2">
          <HoverButton @click="handleClear">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:delete-bin-line" />
            </span>
          </HoverButton>
          <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption">
            <template #default="{ handleInput, handleBlur, handleFocus }">
              <NInput
                ref="inputRef"
                v-model:value="prompt"
                type="textarea"
                :placeholder="placeholder"
                :autosize="{ minRows: 1, maxRows: isMobile ? 4 : 8 }"
                @input="handleInput"
                @focus="handleFocus"
                @blur="handleBlur"
                @keypress="handleEnter"
              />
            </template>
          </NAutoComplete>
          <NButton type="primary" :disabled="buttonDisabled" @click="handleSubmit">
            <template #icon>
              <span class="dark:text-black">
                <SvgIcon icon="ri:send-plane-fill" />
              </span>
            </template>
          </NButton>
        </div>
      </div>
    </footer>
  </div>
</template>
