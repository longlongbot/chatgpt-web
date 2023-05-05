import { BingChat } from 'bing-chat'
import * as dotenv from 'dotenv'

dotenv.config()

async function example() {
  const api = new BingChat({
    cookie: process.env.BING_COOKIE,
  })

  const res = await api.sendMessage('hello', { onProgress: (res) => { console.log(res.text) }})
  // eslint-disable-next-line no-console
  console.log(res.text)
}

example()
