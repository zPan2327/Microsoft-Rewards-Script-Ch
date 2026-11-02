import * as fs from 'node:fs'
import path from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { URLs } from '../../../constants/urls'
import { RSS_FEEDS } from '../../../constants/rssFeeds'
import type {
    HackerNewsResponse,
    RedditListing,
    WikipediaRandomResponse,
    WikipediaTopResponse
} from '../search/SearchTypes'
import type { BotContext } from '../../../core/BotContext'
import type { HttpResponse } from '../../../network/HttpClient'
import { localeRequestHeaders } from '../../../network/RequestHeaders'
import { resolveAccountLocale } from '../../../util/Locale'
import { cleanQuery } from './QueryQuality'
import {
    formatQueryOrigin,
    resolveQueryLocale,
    type QueryKind,
    type QueryOrigin,
    type QueryTopic,
    type SourcedQuery
} from './QueryContext'

type QueryContext = Pick<BotContext, 'config' | 'http' | 'isMobile' | 'logger' | 'accountLocale' | 'userData'>

const MAX_RSS_XML_BYTES = 2 * 1024 * 1024
const FEED_CACHE_MS = 5 * 60 * 1000
const XML_DECLARATION_RE = /<!\s*(?:DOCTYPE|ENTITY)\b/i

interface RssEntry {
    title?: unknown
    source?: unknown
    pubDate?: unknown
    published?: unknown
    updated?: unknown
}
interface RssDocument {
    rss?: { channel?: { item?: RssEntry | RssEntry[]; language?: unknown } }
    'rdf:RDF'?: { item?: RssEntry | RssEntry[] }
    feed?: { entry?: RssEntry | RssEntry[] }
}
interface RssFeed {
    url: string
    source: string
    kind: QueryKind
    language?: string
    country?: string
}
function toArray(value: RssEntry | RssEntry[] | undefined): RssEntry[] {
    return value ? (Array.isArray(value) ? value : [value]) : []
}
function readText(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    if (value && typeof value === 'object' && '#text' in value) return readText(value['#text'])
    return ''
}

const CHINA_HOT_SOURCES = ['BaiduHot', 'TouTiaoHot', 'DouYinHot', 'WeiBoHot', 'ZhiHuHot'] as const
type ChinaHotSource = (typeof CHINA_HOT_SOURCES)[number]

const CHINA_API_BASE = 'https://api.gmya.net/Api/'
const CHINA_BACKOFF_MIN_MS = 1200
const CHINA_BACKOFF_MAX_MS = 2500

interface ChinaHotResponse {
    code?: unknown
    msg?: unknown
    data?: unknown
}

export class ChinaApiRateLimitError extends Error {
    constructor(source: string, detail?: string) {
        super(`China hot source rate limited | source=${source}${detail ? ` | ${detail}` : ''}`)
        this.name = 'ChinaApiRateLimitError'
    }
}

function shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1))
        ;[copy[index], copy[swap]] = [copy[swap]!, copy[index]!]
    }
    return copy
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function chinaApiUrl(source: ChinaHotSource, appkey: string): string {
    return appkey
        ? `${CHINA_API_BASE}${source}?format=json&appkey=${encodeURIComponent(appkey)}`
        : `${CHINA_API_BASE}${source}`
}

function isChinaRateLimited(status: number, payload?: ChinaHotResponse | null): boolean {
    const code = payload?.code
    const msg = typeof payload?.msg === 'string' ? payload.msg : ''
    return (
        status === 403 ||
        status === 429 ||
        code === '403' ||
        code === 403 ||
        code === '429' ||
        code === 429 ||
        msg.includes('请求过于频繁') ||
        msg.includes('appkey')
    )
}

export class QuerySources {
    private readonly feeds = new Map<string, { expires: number; topics: Promise<QueryTopic[]> }>()

    constructor(private readonly bot: QueryContext) {}

    private request<T>(origin: QueryOrigin, language?: string, country?: string): Promise<HttpResponse<T>> {
        const locale = resolveQueryLocale(this.bot)
        const requestLanguage = language ?? origin.language ?? locale.language
        const requestCountry = country ?? origin.country ?? locale.country
        const { acceptLanguage } = resolveAccountLocale({ langCode: requestLanguage, geoLocale: requestCountry })
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-SOURCE',
            `Fetching query source | language=${requestLanguage} | country=${requestCountry} | ${formatQueryOrigin(origin)}`
        )
        return this.bot.http.request<T>(
            {
                url: origin.sourceUrl,
                method: 'GET',
                headers: localeRequestHeaders(acceptLanguage),
                timeout: 8000,
                retries: 0,
                maxResponseBytes: MAX_RSS_XML_BYTES
            },
            this.bot.config.proxy.queryEngine
        )
    }

    getGoogleTrends(country: string, language = 'en'): Promise<QueryTopic[]> {
        return this.getRssTopics(['rss.googleTrends'], language, country)
    }

    async getBingSuggestions(query = '', language = 'en', country = 'US'): Promise<SourcedQuery[]> {
        const origin: QueryOrigin = {
            source: 'bing.suggestions',
            sourceUrl: URLs.queryEngine.bingSuggestions(query, language, country),
            language,
            country
        }
        try {
            const response = await this.request<{
                suggestionGroups?: { searchSuggestions?: { query: string }[] }[]
            }>(origin)
            return (response.data.suggestionGroups?.[0]?.searchSuggestions ?? [])
                .map(item => item.query)
                .filter((text): text is string => typeof text === 'string')
                .map(text => ({ text, ...origin }))
        } catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-BING-SUGGESTIONS', `Request failed | ${String(error)}`)
            return []
        }
    }

    async getBingRelatedTerms(query: string, language = 'en', country = 'US'): Promise<SourcedQuery[]> {
        const origin: QueryOrigin = {
            source: 'bing.related',
            sourceUrl: URLs.queryEngine.bingRelated(query, language, country),
            language,
            country
        }
        try {
            const response = await this.request<unknown[]>(origin)
            const related = response.data?.[1]
            return Array.isArray(related)
                ? related
                      .filter((term): term is string => typeof term === 'string' && term.trim().length > 0)
                      .map(text => ({ text, ...origin }))
                : []
        } catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-BING-RELATED', `Request failed | ${String(error)}`)
            return []
        }
    }

    async getWikipediaTrending(language = 'en'): Promise<QueryTopic[]> {
        const lang = language.split('-')[0] || 'en'
        try {
            const date = new Date(Date.now() - 86400000)
            const origin: QueryOrigin = {
                source: 'wikipedia',
                language: lang,
                sourceUrl: URLs.queryEngine.wikipediaTop(
                    lang,
                    date.getUTCFullYear(),
                    String(date.getUTCMonth() + 1).padStart(2, '0'),
                    String(date.getUTCDate()).padStart(2, '0')
                )
            }
            const response = await this.request<WikipediaTopResponse>(origin)
            return (response.data.items?.[0]?.articles ?? [])
                .filter(
                    article =>
                        !/^(?:Main_Page$|(?:Special|Wikipedia|Help|File|Category|Template|Portal|User|Talk|Draft|Module):)/i.test(
                            article.article
                        )
                )
                .slice(0, 50)
                .map((article, sourceRank) => ({
                    text: article.article.replace(/_/g, ' '),
                    ...origin,
                    kind: 'encyclopedia',
                    publishedAt: date.getTime(),
                    sourceRank
                }))
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-TRENDING',
                `Request failed | lang=${lang} | ${String(error)}`
            )
            return []
        }
    }

    async getRedditTopics(subreddit = 'popular'): Promise<QueryTopic[]> {
        const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '')
        try {
            const origin: QueryOrigin = { source: 'reddit', sourceUrl: URLs.queryEngine.reddit(safe), language: 'en' }
            const response = await this.request<RedditListing>(origin)
            return (response.data.data?.children ?? [])
                .filter(post => !post.data.over_18 && !post.data.stickied)
                .map((post, sourceRank) => ({
                    text: post.data.title,
                    ...origin,
                    kind: 'headline',
                    publishedAt: post.data.created_utc ? post.data.created_utc * 1000 : undefined,
                    sourceRank
                }))
        } catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-REDDIT', `Request failed | ${String(error)}`)
            return []
        }
    }

    async getHackerNewsTopics(): Promise<QueryTopic[]> {
        try {
            const origin: QueryOrigin = { source: 'hackernews', sourceUrl: URLs.queryEngine.hackerNews, language: 'en' }
            const response = await this.request<HackerNewsResponse>(origin)
            return (response.data.hits ?? [])
                .filter(hit => typeof hit.title === 'string')
                .map((hit, sourceRank) => ({
                    text: hit.title!,
                    ...origin,
                    kind: 'headline',
                    publishedAt: hit.created_at_i ? hit.created_at_i * 1000 : undefined,
                    sourceRank
                }))
        } catch (error) {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-HACKERNEWS', `Request failed | ${String(error)}`)
            return []
        }
    }

    async getWikipediaRandom(language = 'en'): Promise<QueryTopic[]> {
        const lang = language.split('-')[0] || 'en'
        try {
            const origin: QueryOrigin = {
                source: 'wikirandom',
                sourceUrl: URLs.queryEngine.wikipediaRandom(lang),
                language: lang
            }
            const response = await this.request<WikipediaRandomResponse>(origin)
            return (response.data.query?.random ?? []).map((page, sourceRank) => ({
                text: page.title,
                ...origin,
                kind: 'random',
                sourceRank
            }))
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-RANDOM',
                `Request failed | lang=${lang} | ${String(error)}`
            )
            return []
        }
    }

    async getRssTopics(selectors: string[], language = 'en', country = 'US'): Promise<QueryTopic[]> {
        const feeds = this.resolveRssFeeds(selectors, language, country)
        const lists: QueryTopic[][] = []
        let next = 0
        const deadline = Date.now() + 20000
        await Promise.all(
            Array.from({ length: Math.min(4, feeds.length) }, async () => {
                while (next < feeds.length && Date.now() < deadline) {
                    const index = next++
                    lists[index] = await this.fetchRssTopics(feeds[index]!, language, country)
                }
            })
        )
        return lists.flat()
    }

    private resolveRssFeeds(selectors: string[], language: string, country: string): RssFeed[] {
        const feeds = new Map<string, RssFeed>()
        const add = (site: string, endpoint?: string): void => {
            const entries = RSS_FEEDS[site]
            if (!entries) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS site "${site}"`)
                return
            }
            const regional = site === 'googleTrends' || site === 'googleNews'
            const endpoints = endpoint ? [endpoint] : regional ? ['local'] : Object.keys(entries)
            for (const name of endpoints) {
                let url = entries[name]
                let feedCountry: string | undefined
                let feedLanguage: string | undefined = [
                    'googleNews',
                    'bbc',
                    'guardian',
                    'theVerge',
                    'arsTechnica',
                    'reddit'
                ].includes(site)
                    ? 'en'
                    : undefined
                if (regional) {
                    feedCountry = name === 'gb' || name === 'us' ? name.toUpperCase() : country
                    if (site === 'googleTrends' && ['local', 'gb', 'us'].includes(name))
                        url = URLs.queryEngine.googleTrends(feedCountry)
                    if (
                        site === 'googleNews' &&
                        ['local', 'gb', 'us', 'world', 'technology', 'business'].includes(name)
                    ) {
                        feedLanguage = name === 'gb' || name === 'us' ? 'en' : language
                        url = URLs.queryEngine.googleNews(
                            feedLanguage,
                            feedCountry,
                            ['world', 'technology', 'business'].includes(name) ? name : undefined
                        )
                    }
                }
                if (!url) {
                    this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS feed "${site}.${name}"`)
                    continue
                }
                feeds.set(url, {
                    url,
                    source: `rss.${site}.${name}`,
                    kind: site === 'googleTrends' ? 'trend' : 'headline',
                    language: feedLanguage,
                    country: feedCountry
                })
            }
        }
        for (const selector of selectors) {
            const [, site, endpoint] = selector.split('.')
            if (site) add(site, endpoint)
            else for (const name of Object.keys(RSS_FEEDS)) add(name)
        }
        return [...feeds.values()]
    }

    private async fetchRssTopics(feed: RssFeed, language: string, country: string): Promise<QueryTopic[]> {
        const origin: QueryOrigin = { ...feed, sourceUrl: feed.url }
        const requestLanguage = feed.language ?? language
        const requestCountry = feed.country ?? country
        const cacheKey = JSON.stringify([feed.url, requestLanguage, requestCountry])
        const cached = this.feeds.get(cacheKey)
        if (cached && cached.expires > Date.now()) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-SOURCE',
                `Using cached feed | language=${requestLanguage} | country=${requestCountry} | ${formatQueryOrigin(origin)}`
            )
            return cached.topics
        }
        const topics = (async (): Promise<QueryTopic[]> => {
            try {
                const response = await this.request<string>(origin, requestLanguage, requestCountry)
                const parsed = typeof response.data === 'string' ? this.parseRssTopics(response.data, feed) : []
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-SOURCE',
                    `Feed ready | topics=${parsed.length} | language=${requestLanguage} | country=${requestCountry} | ${formatQueryOrigin(origin)}`
                )
                return parsed
            } catch (error) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-RSS',
                    `Feed failed | ${formatQueryOrigin(origin)} | ${String(error)}`
                )
                return []
            }
        })()
        const entry = { expires: Date.now() + FEED_CACHE_MS, topics }
        this.feeds.set(cacheKey, entry)
        const result = await topics
        if (!result.length && this.feeds.get(cacheKey) === entry) this.feeds.delete(cacheKey)
        return result
    }

    private parseRssTopics(xml: string, feed: RssFeed): QueryTopic[] {
        if (
            !xml ||
            Buffer.byteLength(xml, 'utf8') > MAX_RSS_XML_BYTES ||
            XML_DECLARATION_RE.test(xml) ||
            XMLValidator.validate(xml) !== true
        )
            return []
        let doc: RssDocument
        try {
            doc = new XMLParser({ ignoreAttributes: true, htmlEntities: true, parseTagValue: false }).parse(xml)
        } catch {
            return []
        }
        const entries = [
            ...toArray(doc.rss?.channel?.item),
            ...toArray(doc['rdf:RDF']?.item),
            ...toArray(doc.feed?.entry)
        ]
        const declaredLanguage = readText(doc.rss?.channel?.language).toLowerCase()
        const language = /^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(declaredLanguage) ? declaredLanguage : feed.language
        const topics: QueryTopic[] = []
        for (const [sourceRank, entry] of entries.slice(0, 100).entries()) {
            const text = cleanQuery(readText(entry.title), feed.kind === 'headline', readText(entry.source))
            if (!text) continue
            const timestamp = Date.parse(readText(entry.pubDate ?? entry.published ?? entry.updated))
            topics.push({
                text,
                source: feed.source,
                sourceUrl: feed.url,
                kind: feed.kind,
                language,
                country: feed.country,
                publishedAt: Number.isFinite(timestamp) ? timestamp : undefined,
                sourceRank
            })
        }
        return topics
    }

    getLocalQueryList(language = 'en'): QueryTopic[] {
        try {
            const file = path.join(__dirname, '../../../data/search-queries.json')
            const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
            const lang = language.split('-')[0] || 'en'
            const queries: unknown = Array.isArray(data)
                ? lang === 'en'
                    ? data
                    : []
                : data && typeof data === 'object'
                  ? (data as Record<string, unknown>)[lang]
                  : []
            return Array.isArray(queries)
                ? queries
                      .filter((query): query is string => typeof query === 'string')
                      .map((text, sourceRank) => ({
                          text,
                          source: 'local',
                          sourceUrl: 'src/data/search-queries.json',
                          kind: 'evergreen',
                          language: lang,
                          sourceRank
                      }))
                : []
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-LOCAL-QUERY-LIST',
                `Failed reading search-queries.json | ${String(error)}`
            )
            return []
        }
    }

    /**
     * China hot-search topics aggregated from Baidu, Toutiao, Douyin, Weibo and Zhihu.
     *
     * Source: gmya.net hot-word API. `searchSettings.chinaApi.appkey` lifts the free-tier
     * rate limit; with an appkey two sources are queried, without one only a single source
     * is used and a randomised backoff is inserted between requests. Remaining sources act
     * as fallbacks whenever the primary ones return nothing.
     */
    async getChinaHotTopics(language = 'zh-CN', country = 'CN'): Promise<QueryTopic[]> {
        const appkey = this.bot.config.searchSettings.chinaApi?.appkey?.trim() ?? ''
        const hasAppkey = appkey.length > 0
        const order = shuffled(CHINA_HOT_SOURCES)
        const primary = order.slice(0, hasAppkey ? 2 : 1)
        const spare = order.slice(hasAppkey ? 2 : 1)
        const collected = new Map<string, QueryTopic>()
        let backoffMultiplier = 1

        const backoff = async (): Promise<void> => {
            if (hasAppkey) return
            const span = CHINA_BACKOFF_MAX_MS - CHINA_BACKOFF_MIN_MS
            await sleep(Math.round(CHINA_BACKOFF_MIN_MS * backoffMultiplier + Math.random() * span * backoffMultiplier))
        }

        const attempt = async (source: ChinaHotSource): Promise<boolean> => {
            try {
                const topics = await this.fetchChinaHotSource(source, appkey, language, country)
                for (const topic of topics) if (!collected.has(topic.text)) collected.set(topic.text, topic)
                if (!topics.length)
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'SEARCH-CHINA',
                        `China hot source empty | source=${source}`
                    )
                return topics.length > 0
            } catch (error) {
                if (error instanceof ChinaApiRateLimitError) backoffMultiplier *= 1.5
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-CHINA',
                    `China hot source failed | source=${source} | appkey=${hasAppkey ? 'set' : 'free-tier'} | ${String(error)}`
                )
                return false
            }
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-CHINA',
            `Fetching China hot topics | country=${country} | appkey=${hasAppkey ? 'set' : 'free-tier'}` +
                ` | primary=${primary.join(',')} | spare=${spare.join(',')}`
        )

        for (const [index, source] of primary.entries()) {
            if (index > 0) await backoff()
            await attempt(source)
        }
        if (!collected.size) {
            for (const source of spare) {
                await backoff()
                if (await attempt(source)) break
            }
        }
        if (!collected.size) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-CHINA',
                `All ${CHINA_HOT_SOURCES.length} China hot sources failed | falling back to the remaining query engines`
            )
            return []
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-CHINA',
            `China hot topics ready | queries=${collected.size} | appkey=${hasAppkey ? 'set' : 'free-tier'}`
        )
        return [...collected.values()]
    }

    private async fetchChinaHotSource(
        source: ChinaHotSource,
        appkey: string,
        language: string,
        country: string
    ): Promise<QueryTopic[]> {
        const origin: QueryOrigin = {
            source: `china.${source}`,
            sourceUrl: chinaApiUrl(source, appkey),
            language,
            country
        }
        const response = await this.request<ChinaHotResponse>(origin)
        const payload = response.data
        if (isChinaRateLimited(response.status, payload))
            throw new ChinaApiRateLimitError(source, typeof payload?.msg === 'string' ? payload.msg : undefined)
        const items = Array.isArray(payload?.data) ? payload.data : []
        const topics: QueryTopic[] = []
        for (const [sourceRank, item] of items.entries()) {
            const title = (item as { title?: unknown } | null)?.title
            if (typeof title !== 'string') continue
            const text = cleanQuery(title, true)
            if (!text) continue
            topics.push({ text, ...origin, kind: 'trend', sourceRank })
        }
        return topics
    }
}
