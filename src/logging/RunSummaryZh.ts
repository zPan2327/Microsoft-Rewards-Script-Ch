import type { AccountStats } from '../core/RunTypes'

type RunStatus = 'completed' | 'partial' | 'interrupted' | 'cancelled' | 'failed' | 'skipped'

function statusZh(status: string): string {
    switch (status as RunStatus) {
        case 'completed':
            return '完成'
        case 'partial':
            return '部分完成'
        case 'interrupted':
            return '中断'
        case 'cancelled':
            return '已取消'
        case 'failed':
            return '失败'
        case 'skipped':
            return '已跳过'
        default:
            return status
    }
}

function minutes(ms: number): string {
    return (ms / 60000).toFixed(1)
}

/**
 * 中文运行摘要。
 *
 * 上游 v5 的全部日志为英文，逐条本地化 200+ 文件既不现实也难以跟随上游。
 * 这里选择"关键路径中文化"：每轮结束与每个账户结束时额外输出一条中文摘要，
 * 控制台与微信推送都能直接读懂结果；其余调试日志保持英文以便对照上游文档。
 */
export function runSummaryZh(
    stats: AccountStats[],
    expectedAccounts: number,
    runStartTime: number,
    interrupted = false
): string {
    const pointsKnown = stats.length === expectedAccounts && stats.every(stat => stat.pointsKnown !== false)
    const gained = stats.reduce((sum, stat) => sum + stat.collectedPoints, 0)
    const before = stats.reduce((sum, stat) => sum + stat.initialPoints, 0)
    const now = stats.reduce((sum, stat) => sum + stat.finalPoints, 0)
    const status =
        interrupted || stats.length !== expectedAccounts
            ? 'interrupted'
            : stats.some(stat => !stat.success)
              ? 'partial'
              : 'completed'
    return (
        `本轮结束 | 状态=${statusZh(status)} | 账户=${stats.length}/${expectedAccounts}` +
        ` | 获得积分=${pointsKnown ? gained : '未知'} | 运行前余额=${before} | 当前余额=${now}` +
        ` | 耗时=${minutes(Date.now() - runStartTime)}分钟`
    )
}

export function accountSummaryZh(stats: AccountStats): string {
    const status = stats.status ?? (stats.success ? 'completed' : 'partial')
    const pointsKnown = stats.pointsKnown !== false
    const counts = stats.completion?.counts
    return (
        `账户结束 | 账户=${stats.email} | 状态=${statusZh(status)}` +
        ` | 获得积分=${pointsKnown ? stats.collectedPoints : '未知'} | 余额=${stats.finalPoints}` +
        ` | 用时=${stats.duration}秒` +
        (counts
            ? ` | 任务: 已完成${counts.completed} 未完成${counts.incomplete} 不可用${counts.unavailable} 不适用${counts.notApplicable}`
            : '') +
        (stats.error ? ` | 原因=${stats.error.slice(0, 200)}` : '')
    )
}
