import { test as base, type BrowserContext } from '@playwright/test'

import { signInAsQaOperator } from './ronda'

type QaStorageState = Awaited<ReturnType<BrowserContext['storageState']>>

export const test = base.extend<
  { storageState: QaStorageState },
  { qaPosStorageState: QaStorageState }
>({
  qaPosStorageState: [async ({ browser }, provide, workerInfo) => {
    const context = await browser.newContext({
      baseURL: workerInfo.project.use.baseURL,
      locale: workerInfo.project.use.locale,
      timezoneId: workerInfo.project.use.timezoneId,
      viewport: { width: 1440, height: 900 },
    })
    let state: QaStorageState
    try {
      await signInAsQaOperator(await context.newPage())
      state = await context.storageState()
    } finally {
      await context.close()
    }
    await provide(state)
  }, { scope: 'worker' }],
  storageState: async ({ qaPosStorageState }, provide) => {
    await provide(qaPosStorageState)
  },
})
