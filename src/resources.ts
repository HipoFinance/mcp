interface CacheEntry {
    body: string
    fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

export async function fetchDoc(url: string, cacheSeconds: number): Promise<string> {
    const entry = cache.get(url)
    const now = Date.now()
    if (entry != null && now - entry.fetchedAt < cacheSeconds * 1000) {
        return entry.body
    }
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) {
            throw new Error(`fetching ${url} returned ${response.status.toString()}`)
        }
        const body = await response.text()
        cache.set(url, { body, fetchedAt: now })
        return body
    } catch (error) {
        // Serve a stale copy over an error when we have one.
        if (entry != null) {
            return entry.body
        }
        throw error
    }
}
