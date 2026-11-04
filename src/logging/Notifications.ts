import type { ConfigWebhook } from '../config/Config'
import type { LogLevel } from './Logger'
import { sendDiscord, flushDiscordQueue } from './Discord'
import { sendNtfy, flushNtfyQueue } from './Ntfy'
import { sendTelegram, flushTelegramQueue } from './Telegram'
import { sendPushPlus, flushPushPlusQueue } from './PushPlus'
import { sendServerChan, flushServerChanQueue } from './ServerChan'
import { logSystemMessage } from './LogEvent'
import type { LogColor } from './LogStyle'

export async function sendNotifications(
    config: ConfigWebhook,
    content: string,
    level: LogLevel,
    color?: LogColor
): Promise<void> {
    // 日志行为了保持单行会把换行转义成字面 `\n`（见 sanitizeLogMessage）。
    // 推送是给人看的，这里还原成真实换行，多行摘要才不会挤成一坨。
    const body = content.replace(/\\n/g, '\n')
    const requests: Promise<void>[] = []
    if (config.discord?.enabled && config.discord.url)
        requests.push(sendDiscord(config.discord.url, body, level, color))
    if (config.ntfy?.enabled && config.ntfy.url) requests.push(sendNtfy(config.ntfy, body, level))
    if (config.telegram?.enabled && config.telegram.botToken && config.telegram.chatId)
        requests.push(sendTelegram(config.telegram, body, level))
    if (config.pushplus?.enabled && config.pushplus.token) requests.push(sendPushPlus(config.pushplus, body, level))
    if (config.serverchan?.enabled && config.serverchan.sendKey)
        requests.push(sendServerChan(config.serverchan, body, level))
    for (const result of await Promise.allSettled(requests))
        if (result.status === 'rejected') logSystemMessage('warn', 'NOTIFICATIONS', 'Could not queue notification.')
}

export async function flushNotifications(timeoutMs: number): Promise<void> {
    await Promise.allSettled([
        flushDiscordQueue(timeoutMs),
        flushNtfyQueue(timeoutMs),
        flushTelegramQueue(timeoutMs),
        flushPushPlusQueue(timeoutMs),
        flushServerChanQueue(timeoutMs)
    ])
}
