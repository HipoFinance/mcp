export function isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('429')
}

export interface RetryOptions {
    attempts?: number
    baseDelayMs?: number
}

// Retry rate-limited calls with exponential backoff. Toncenter without an API
// key allows about one request per second, and some tools chain several
// getter calls — backing off lets keyless deployments still answer.
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const attempts = options.attempts ?? 5
    const baseDelayMs = options.baseDelayMs ?? 600
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (!isRateLimitError(error) || attempt === attempts - 1) {
                throw error
            }
            const delay = baseDelayMs * 2 ** attempt + Math.random() * 200
            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }
    throw lastError
}

// Single-value TTL cache with in-flight deduplication: concurrent callers
// share one produce() call, and a failed produce() is not cached.
export class TtlCache<T> {
    private entry: { at: number; promise: Promise<T> } | undefined

    constructor(private readonly ttlMs: number) {}

    async get(produce: () => Promise<T>): Promise<T> {
        const now = Date.now()
        if (this.entry != null && now - this.entry.at < this.ttlMs) {
            return await this.entry.promise
        }
        const promise = produce()
        this.entry = { at: now, promise }
        try {
            return await promise
        } catch (error) {
            this.entry = undefined
            throw error
        }
    }
}
