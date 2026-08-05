import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Address, Dictionary } from '@ton/ton'
import { Participation, Times, TreasuryConfig, participationDictionaryValue } from '@hipo-finance/sdk'
import { formatGram, parseGram } from './format.js'
import {
    computeApy,
    getExchangeRate,
    getFees,
    getParticipation,
    getRewardHistory,
    getWalletStatus,
    normalizeClubLevel,
} from './protocol.js'
import { HipoReader, LoanStatus, TreasuryFees, WalletStatus } from './reader.js'

const roundDuration = 65536
const someAddress = Address.parse('EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ')

function fakeTimes(): Times {
    return {
        currentRoundSince: 1784696584n,
        participateSince: 1784729352n,
        participateUntil: 1784753928n,
        nextRoundSince: 1784696584n + BigInt(roundDuration),
        nextRoundUntil: 1784696584n + 2n * BigInt(roundDuration),
        stakeHeldFor: 32768n,
    }
}

function fakeState(): TreasuryConfig {
    return {
        totalCoins: 1_080_000_000_000n, // 1080 GRAM
        totalTokens: 1_000_000_000_000n, // 1000 hGRAM
        totalStaking: 5_000_000_000n,
        totalUnstaking: 0n,
        totalBorrowersStake: 0n,
        parent: someAddress,
        participations: Dictionary.empty(Dictionary.Keys.BigUint(32), participationDictionaryValue),
        roundsImbalance: 255n,
        stopped: false,
        instantMint: false,
        loanCodes: Dictionary.empty(),
        previousRate: 1_078_000_000n,
        currentRate: 1_080_000_000n,
        halter: someAddress,
        governor: someAddress,
        proposedGovernor: null,
        governanceFee: 4096n,
        collectionCodes: Dictionary.empty(),
        billCodes: Dictionary.empty(),
        oldParents: Dictionary.empty(),
    }
}

class FakeReader implements HipoReader {
    participationRequests: bigint[] = []

    getTimes(): Promise<Times> {
        return Promise.resolve(fakeTimes())
    }
    getTreasuryState(): Promise<TreasuryConfig> {
        return Promise.resolve(fakeState())
    }
    getTreasuryFees(): Promise<TreasuryFees> {
        return Promise.resolve({ requestLoanFee: 1n, depositCoinsFee: 2n, unstakeAllTokensFee: 3n })
    }
    getParticipation(roundSince: bigint): Promise<Participation> {
        this.participationRequests.push(roundSince)
        return Promise.resolve({ state: 3, totalStaked: 7_000_000_000n, totalRecovered: 0n, stakeHeldUntil: 0n })
    }
    getMaxPunishment(): Promise<bigint> {
        return Promise.resolve(101_000_000_000n)
    }
    getWalletStatus(): Promise<WalletStatus> {
        return Promise.resolve({ deployed: false, tokens: 0n, staking: [], unstaking: 0n })
    }
    getLoanStatus(): Promise<LoanStatus> {
        return Promise.resolve({ address: someAddress, deployed: false, balance: 0n })
    }
}

void test('computeApy follows the showState formula', () => {
    const apy = computeApy(1_080_000_000n, 1_078_000_000n, roundDuration)
    const expected = Math.pow(1_080_000_000 / 1_078_000_000, (365 * 24 * 60 * 60) / roundDuration) - 1
    assert.equal(apy, expected)
    assert.ok(apy != null && apy > 0)
})

void test('computeApy guards zero previous rate', () => {
    assert.equal(computeApy(1_080_000_000n, 0n, roundDuration), null)
})

void test('exchange rate reports totals ratio and disclaimer', async () => {
    const result = (await getExchangeRate(new FakeReader())) as Record<string, unknown>
    assert.equal(result['oneHgramInGram'], (1.08).toFixed(9))
    assert.equal(result['totalCoinsGram'], '1080')
    assert.equal(result['totalTokensHgram'], '1000')
    assert.ok(typeof result['disclaimer'] === 'string' && result['disclaimer'].length > 0)
})

void test('participation defaults to the current round', async () => {
    const reader = new FakeReader()
    const result = (await getParticipation(reader, undefined)) as Record<string, unknown>
    assert.deepEqual(reader.participationRequests, [fakeTimes().currentRoundSince])
    assert.equal(result['state'], 'validating')
    assert.equal(result['totalStakedGram'], '7')
})

void test('wallet status handles undeployed wallets', async () => {
    const result = (await getWalletStatus(new FakeReader(), someAddress)) as Record<string, unknown>
    assert.equal(result['deployed'], false)
    assert.equal(result['hgramBalance'], '0')
})

void test('fees explain refund timing alongside getter-sourced amounts', async () => {
    const result = (await getFees(new FakeReader())) as Record<string, unknown>
    assert.equal(result['depositCoinsFeeGram'], formatGram(2n))
    assert.equal(result['unstakeAllTokensFeeGram'], formatGram(3n))
    const notes = result['notes']
    assert.ok(Array.isArray(notes))
    assert.ok(notes.some((n: string) => n.includes('gas prepayments')))
    assert.ok(notes.some((n: string) => n.includes('separate excess transfer')))
    assert.ok(notes.some((n: string) => n.includes('paid out together with the final GRAM withdrawal')))
    assert.ok(notes.some((n: string) => n.includes('net all flows')))
})

void test('wallet status note mentions the gas remainder in unstake payouts', async () => {
    class DeployedReader extends FakeReader {
        override getWalletStatus(): Promise<WalletStatus> {
            return Promise.resolve({ deployed: true, tokens: 1_000_000_000n, staking: [], unstaking: 500_000_000n })
        }
    }
    const result = (await getWalletStatus(new DeployedReader(), someAddress)) as Record<string, unknown>
    assert.equal(result['deployed'], true)
    assert.ok(typeof result['note'] === 'string' && result['note'].includes('unused part of the unstake gas prepayment'))
})

void test('reward history reports missing configuration cleanly', async () => {
    const result = (await getRewardHistory(undefined, someAddress)) as Record<string, unknown>
    assert.ok(typeof result['error'] === 'string' && result['error'].includes('HIPO_REWARDS_API_BASE'))
})

// Shape taken from a live api.hipogang.io/wallet-rewards response.
function fakeRewards(clubLevel: unknown): Record<string, unknown> {
    return {
        club_level: clubLevel,
        reward_coefficients: [1, 1.2, 1.6, 2.2, 3, 4, 5.2, 6.6, 8.2, 10],
        hton_hpo_reward_rate: 0.0021902,
        hpo_sum_rewards: '0.000000000',
        hton_sum_rewards: '0.371671463',
        earned_rewards: [{ round_since: 1785745160, stake_reward: '0.000606966', hpo_reward: '0.004289492' }],
    }
}

void test('club level is reported the way the app shows it, starting at level 1', () => {
    const raw = fakeRewards(6)
    const normalized = normalizeClubLevel(raw) as Record<string, unknown>
    assert.equal(normalized['club_level'], 7)
    assert.equal(normalized['hton_sum_rewards'], '0.371671463')
    assert.deepEqual(normalized['earned_rewards'], raw['earned_rewards'])
    assert.equal(raw['club_level'], 6)

    assert.equal((normalizeClubLevel(fakeRewards(0)) as Record<string, unknown>)['club_level'], 1)
    assert.equal((normalizeClubLevel(fakeRewards(9)) as Record<string, unknown>)['club_level'], 10)
})

void test('the club level coefficient is resolved against the zero-indexed list', () => {
    // Raw level 6 is the seventh coefficient, not reward_coefficients[7].
    assert.equal((normalizeClubLevel(fakeRewards(6)) as Record<string, unknown>)['club_level_reward_coefficient'], 5.2)
    assert.equal((normalizeClubLevel(fakeRewards(0)) as Record<string, unknown>)['club_level_reward_coefficient'], 1)
    assert.equal((normalizeClubLevel(fakeRewards(9)) as Record<string, unknown>)['club_level_reward_coefficient'], 10)
})

void test('club level normalization leaves unexpected payloads alone', () => {
    assert.deepEqual(normalizeClubLevel({ earned_rewards: [] }), { earned_rewards: [] })
    assert.deepEqual(normalizeClubLevel(fakeRewards(null)), fakeRewards(null))
    assert.equal(normalizeClubLevel(null), null)
    const noCoefficients = normalizeClubLevel({ club_level: 6 }) as Record<string, unknown>
    assert.equal(noCoefficients['club_level'], 7)
    assert.equal(noCoefficients['club_level_reward_coefficient'], null)
})

void test('gram formatting round-trips', () => {
    assert.equal(formatGram(1_500_000_000n), '1.5')
    assert.equal(formatGram(0n), '0')
    assert.equal(parseGram('1.5'), 1_500_000_000n)
    assert.equal(parseGram('300000'), 300_000_000_000_000n)
    assert.throws(() => parseGram('abc'))
    assert.throws(() => parseGram('1.1234567891'))
})
