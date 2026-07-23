import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TtlCache, withRetry } from './util.js'

void test('withRetry retries 429 errors and succeeds', async () => {
    let calls = 0
    const result = await withRetry(
        () => {
            calls += 1
            if (calls < 3) {
                return Promise.reject(new Error('Request failed with status code 429'))
            }
            return Promise.resolve('ok')
        },
        { baseDelayMs: 1 },
    )
    assert.equal(result, 'ok')
    assert.equal(calls, 3)
})

void test('withRetry does not retry other errors', async () => {
    let calls = 0
    await assert.rejects(
        withRetry(
            () => {
                calls += 1
                return Promise.reject(new Error('boom'))
            },
            { baseDelayMs: 1 },
        ),
        /boom/,
    )
    assert.equal(calls, 1)
})

void test('withRetry gives up after the configured attempts', async () => {
    let calls = 0
    await assert.rejects(
        withRetry(
            () => {
                calls += 1
                return Promise.reject(new Error('Request failed with status code 429'))
            },
            { attempts: 3, baseDelayMs: 1 },
        ),
        /429/,
    )
    assert.equal(calls, 3)
})

void test('TtlCache dedups concurrent calls and caches within the TTL', async () => {
    let calls = 0
    const cache = new TtlCache<number>(60_000)
    const produce = () => {
        calls += 1
        return Promise.resolve(calls)
    }
    const [a, b] = await Promise.all([cache.get(produce), cache.get(produce)])
    const c = await cache.get(produce)
    assert.deepEqual([a, b, c], [1, 1, 1])
    assert.equal(calls, 1)
})

void test('TtlCache expires and does not cache failures', async () => {
    let calls = 0
    const cache = new TtlCache<number>(1)
    await cache.get(() => {
        calls += 1
        return Promise.resolve(calls)
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await cache.get(() => {
        calls += 1
        return Promise.resolve(calls)
    })
    assert.equal(calls, 2)

    const failing = new TtlCache<number>(60_000)
    await assert.rejects(failing.get(() => Promise.reject(new Error('boom'))))
    const recovered = await failing.get(() => Promise.resolve(7))
    assert.equal(recovered, 7)
})
