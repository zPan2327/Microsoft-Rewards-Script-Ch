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

/** `MM-DD HH:mm`，跟随容器时区（默认 Asia/Shanghai）。 */
function stamp(date: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 中文运行摘要（**单条聚合**）。
 *
 * 上游 v5 的全部日志为英文，逐条本地化 200+ 文件既不现实也难以跟随上游。
 * 这里选择"关键路径中文化"：每轮结束输出一条聚合摘要，把各个账号的结果
 * 拼在一条里，控制台与推送都能一眼看完；其余日志保持可对照上游。
 *
 * 输出形如：
 * ```
 * 奖励运行｜11-04 07:03｜部分完成
 * 3/3 账户｜共 +219 分｜余额 38425→38644｜307.0 分钟
 * zpan2327@outlook.com +73（19046→19119）部分完成
 * ```
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
    // 与下面每行的状态保持同一口径：只要有一个账户不是「完成」，整轮就是「部分完成」。
    // （上游原本只看 success 布尔值，会出现"总览完成、明细部分完成"的自相矛盾。）
    const accountStatusOf = (stat: AccountStats): string => stat.status ?? (stat.success ? 'completed' : 'partial')
    const status =
        interrupted || stats.length !== expectedAccounts
            ? 'interrupted'
            : stats.some(stat => accountStatusOf(stat) !== 'completed')
              ? 'partial'
              : 'completed'

    const head = `奖励运行｜${stamp(new Date())}｜${statusZh(status)}`
    const totals =
        `${stats.length}/${expectedAccounts} 账户｜共 +${pointsKnown ? gained : '未知'} 分` +
        `｜余额 ${before}→${now}｜${minutes(Date.now() - runStartTime)} 分钟`

    const rows = stats.map(stat => {
        const points = stat.pointsKnown !== false ? `+${stat.collectedPoints}` : '未知'
        return `${stat.email} ${points}（${stat.initialPoints}→${stat.finalPoints}）${statusZh(accountStatusOf(stat))}`
    })

    return [head, totals, ...rows].join('\n')
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
