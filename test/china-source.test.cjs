'use strict'

// 中国热搜源（gmya.net）单元测试。
// 直接针对编译产物 dist/ 运行，因此执行前需要先 `npm run build`。
// 覆盖：URL 构造、appkey 裁剪、跨源去重、限流兜底、全失败、结构异常、标题清洗。

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { QuerySources } = require(path.join(__dirname, '..', 'dist', 'rewards', 'shared', 'query', 'QuerySources.js'))

const CHINA_SOURCES = ['BaiduHot', 'TouTiaoHot', 'DouYinHot', 'WeiBoHot', 'ZhiHuHot']

function ok(data) {
    return { code: 200, msg: '请求成功', data }
}

function rateLimited() {
    return { code: 403, msg: '您请求过于频繁，未使用账号appkey请求将限制请求频率' }
}

function sourceNameOf(url) {
    return new URL(url).pathname.split('/').pop()
}

function createBot(options = {}) {
    const calls = []
    const warnings = []
    const responses = options.responses ?? {}
    const bot = {
        config: {
            searchSettings: { chinaApi: { appkey: options.appkey ?? '' }, useAccountLocale: true },
            proxy: { queryEngine: false }
        },
        userData: { geoLocale: 'CN' },
        accountLocale: { country: 'CN', language: 'zh-CN', acceptLanguage: 'zh-CN' },
        isMobile: 'desktop',
        logger: {
            debug: () => undefined,
            info: () => undefined,
            error: () => undefined,
            warn: (_isMobile, tag, message) => warnings.push({ tag, message })
        },
        http: {
            request: async cfg => {
                const source = sourceNameOf(cfg.url)
                calls.push({ url: cfg.url, source })
                const payload = responses[source] ?? ok([])
                return {
                    data: payload,
                    status: payload.code === 403 ? 403 : 200,
                    statusText: '',
                    headers: {},
                    config: cfg
                }
            }
        }
    }
    return { bot, calls, warnings }
}

function sameForAllSources(payload) {
    const map = {}
    for (const name of CHINA_SOURCES) map[name] = payload
    return map
}

test('无 appkey 时只请求 1 个源，且 URL 不带查询串', async () => {
    const { bot, calls } = createBot({
        responses: sameForAllSources(ok([{ title: '甲热搜' }, { title: '乙热搜' }]))
    })
    const topics = await new QuerySources(bot).getChinaHotTopics('zh-cn', 'CN')

    assert.equal(calls.length, 1, '免费档只应请求一个首选源')
    assert.ok(!calls[0].url.includes('?'), `免费档 URL 不应带查询串: ${calls[0].url}`)
    assert.deepEqual(topics.map(t => t.text).sort(), ['甲热搜', '乙热搜'].sort())
})

test('有 appkey 时请求 2 个源，URL 带 format=json 与 appkey', async () => {
    const { bot, calls } = createBot({
        appkey: 'KEY123',
        responses: sameForAllSources(ok([{ title: '同一热搜' }]))
    })
    const topics = await new QuerySources(bot).getChinaHotTopics()

    assert.equal(calls.length, 2, '有 appkey 时应请求两个源')
    for (const call of calls) assert.match(call.url, /\?format=json&appkey=KEY123$/)
    assert.equal(topics.length, 1, '跨源相同标题应被去重')
})

test('appkey 两侧空格会被裁掉', async () => {
    const { bot, calls } = createBot({
        appkey: '  KEY123  ',
        responses: sameForAllSources(ok([{ title: '热搜' }]))
    })
    await new QuerySources(bot).getChinaHotTopics()

    assert.match(calls[0].url, /appkey=KEY123$/)
})

test('首选源限流(403)后回落备用源', async () => {
    const responses = sameForAllSources(rateLimited())
    responses.WeiBoHot = ok([{ title: '兜底热搜' }])

    const { bot, warnings } = createBot({ appkey: 'KEY123', responses })
    const topics = await new QuerySources(bot).getChinaHotTopics()

    assert.equal(topics.length, 1)
    assert.equal(topics[0].text, '兜底热搜')
    assert.equal(topics[0].source, 'china.WeiBoHot')
    assert.ok(
        warnings.some(w => w.tag === 'SEARCH-CHINA' && w.message.includes('rate limited')),
        '限流应产生 SEARCH-CHINA 告警'
    )
})

test('全部源限流时返回空数组且不抛异常', async () => {
    const { bot, warnings } = createBot({ appkey: 'KEY123', responses: sameForAllSources(rateLimited()) })
    const topics = await new QuerySources(bot).getChinaHotTopics()

    assert.deepEqual(topics, [])
    assert.equal(warnings.filter(w => w.message.includes('China hot source failed')).length, 5, '5 个源各告警一次')
    assert.ok(
        warnings.some(w => w.message.includes('All 5 China hot sources failed')),
        '全部失败时应有汇总告警'
    )
})

test('响应结构异常(非数组)时按空处理', async () => {
    const { bot } = createBot({
        appkey: 'KEY123',
        responses: sameForAllSources({ code: 200, msg: '请求成功', data: '<html>维护中</html>' })
    })
    const topics = await new QuerySources(bot).getChinaHotTopics()

    assert.deepEqual(topics, [])
})

test('标题去空格、丢弃空标题，并标记来源与类型', async () => {
    const { bot } = createBot({
        responses: sameForAllSources(ok([{ title: '  甲热搜  ' }, { title: '   ' }, { title: '' }, { hot: '1万' }]))
    })
    const topics = await new QuerySources(bot).getChinaHotTopics('zh-cn', 'CN')

    assert.deepEqual(
        topics.map(t => t.text),
        ['甲热搜']
    )
    const topic = topics[0]
    assert.equal(topic.kind, 'trend')
    assert.equal(topic.language, 'zh-cn')
    assert.equal(topic.country, 'CN')
    assert.match(topic.source, /^china\.(BaiduHot|TouTiaoHot|DouYinHot|WeiBoHot|ZhiHuHot)$/)
})
