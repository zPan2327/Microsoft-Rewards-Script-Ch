import type { HttpRequestConfig } from '../network/HttpClient'
import type { WebhookServerChanConfig } from '../config/Config'
import type { LogLevel } from './Logger'
import { createNotificationQueue, enqueueNotification, flushQueue } from './Queue'

const serverChanQueue = createNotificationQueue()

const DEFAULT_TITLE = '微软奖励脚本'

/**
 * ServerChan Turbo (`sctapi.ft07.com`) push channel for WeChat.
 *
 * `sendKey` is the `SCT...t` key copied from the ServerChan Turbo console.
 */
export async function sendServerChan(config: WebhookServerChanConfig, content: string, level: LogLevel): Promise<void> {
    const sendKey = config?.sendKey?.trim()
    if (!sendKey) return

    const title = (config.title || DEFAULT_TITLE).slice(0, 32)
    const body = content.length > 30000 ? `${content.slice(0, 30000)}\n...(truncated)` : content

    const request: HttpRequestConfig = {
        method: 'POST',
        url: `https://sctapi.ft07.com/${sendKey}.send`,
        headers: { 'Content-Type': 'application/json' },
        data: {
            title,
            desp: body,
            tags: level === 'error' ? '错误' : level === 'warn' ? '警告' : ''
        },
        timeout: 10000
    }

    await enqueueNotification(serverChanQueue, 'ServerChan', content, level, request)
}

export function flushServerChanQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(serverChanQueue, timeoutMs)
}
