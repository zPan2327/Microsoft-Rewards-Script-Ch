const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runSummaryZh } = require('../dist/logging/RunSummaryZh.js')

const account = (over = {}) => ({
    email: 'a@b.com',
    initialPoints: 100,
    finalPoints: 173,
    collectedPoints: 73,
    duration: 600,
    status: 'partial',
    success: true,
    pointsKnown: true,
    ...over
})

test('聚合：单条消息里带齐所有账户明细', () => {
    const stats = [
        account({ email: 'zpan2327@outlook.com', initialPoints: 19046, finalPoints: 19119 }),
        account({ email: 'zpan23456@gmail.com', initialPoints: 10127, finalPoints: 10200 }),
        account({ email: 'zpan2327@163.com', initialPoints: 9252, finalPoints: 9325 })
    ]
    const out = runSummaryZh(stats, 3, Date.now() - 307 * 60000)
    const lines = out.split('\n')

    assert.equal(lines.length, 5, '应为 2 行总览 + 3 行明细')
    assert.ok(out.includes('3/3 账户'), out)
    assert.ok(out.includes('共 +219 分'), out)
    assert.ok(out.includes('余额 38425→38644'), out)
    assert.ok(out.includes('307.0 分钟'), out)
    for (const s of stats) assert.ok(out.includes(s.email), `缺少 ${s.email}`)
})

test('状态口径一致：明细是部分完成时，总览不能显示完成', () => {
    const out = runSummaryZh([account()], 1, Date.now())
    const [head] = out.split('\n')
    assert.ok(head.includes('部分完成'), head)
    assert.ok(!head.includes('｜完成'), head)
})

test('全部完成时才标「完成」', () => {
    const out = runSummaryZh([account({ status: 'completed' })], 1, Date.now())
    assert.ok(out.split('\n')[0].includes('完成'), out)
    assert.ok(!out.includes('部分完成'), out)
})

test('账户数不足时标记中断', () => {
    const out = runSummaryZh([account()], 3, Date.now())
    assert.ok(out.split('\n')[0].includes('中断'), out)
})

test('积分未知时不显示 +0', () => {
    const out = runSummaryZh([account({ pointsKnown: false })], 1, Date.now())
    assert.ok(out.includes('未知'), out)
    assert.ok(!/\+\d/.test(out), out)
})

test('全中文：除邮箱与数字外不含英文单词', () => {
    const out = runSummaryZh([account(), account()], 2, Date.now())
    const stripped = out.replace(/[\w.+-]+@[\w.-]+/g, ' ').replace(/\d+(\.\d+)?/g, ' ')
    const words = stripped.match(/[A-Za-z]{2,}/g) || []
    assert.deepEqual(words, [], `残留英文: ${words.join(',')}`)
})
