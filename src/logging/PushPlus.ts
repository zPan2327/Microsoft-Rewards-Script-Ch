import type { HttpRequestConfig } from '../network/HttpClient'
import type { WebhookPushPlusConfig } from '../config/Config'
import type { LogLevel } from './Logger'
import { createNotificationQueue, enqueueNotification, flushQueue } from './Queue'

const pushPlusQueue = createNotificationQueue()

const DEFAULT_TITLE = '微软奖励脚本'

function levelLabel(level: LogLevel): string {
    switch (level) {
        case 'error':
            return '错误'
        case 'warn':
            return '警告'
        case 'info':
            return '信息'
        case 'debug':
            return '调试'
        default:
            return '日志'
    }
}

/**
 * PushPlus (WeChat) push channel.
 *
 * Free accounts are rate limited per token, so delivery goes through the shared
 * notification queue and only the run summary is prioritised.
 */
export async function sendPushPlus(config: WebhookPushPlusConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.token) return

    const title = (config.title || DEFAULT_TITLE).slice(0, 100)
    const body = content.length > 18000 ? `${content.slice(0, 18000)}\n...(truncated)` : content

    const request: HttpRequestConfig = {
        method: 'POST',
        url: 'https://www.pushplus.plus/send',
        headers: { 'Content-Type': 'application/json' },
        data: {
            token: config.token.trim(),
            title: `${title} · ${levelLabel(level)}`,
            content: body,
            template: config.template ?? 'markdown',
            ...(config.channel?.trim() ? { channel: config.channel.trim() } : {})
        },
        timeout: 10000
    }

    await enqueueNotification(pushPlusQueue, 'PushPlus', content, level, request)
}

export function flushPushPlusQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(pushPlusQueue, timeoutMs)
}
