import { Address } from '@ton/ton'
import { ParticipationState, Participation } from '@hipo-finance/sdk'
import { disclaimer } from './config.js'
import { formatGram, formatPercent, formatTime } from './format.js'
import { HipoReader } from './reader.js'

const yearSeconds = 365 * 24 * 60 * 60

function participationStateName(state: ParticipationState | undefined): string {
    return state == null ? 'unknown' : (ParticipationState[state] ?? 'unknown').toLowerCase()
}

// APY from on-chain rates only, per the showState formula
// (contract repo, docs/specs/2026-07-16-showstate-apy-formula.md):
// growth = current_rate / previous_rate per round length, compounded to a year.
// Assumes Hipo validates on both round chains, so the rate updates once per round length.
export function computeApy(currentRate: bigint, previousRate: bigint, roundDurationSeconds: number): number | null {
    if (previousRate <= 0n || roundDurationSeconds <= 0) {
        return null
    }
    const growth = Number(currentRate) / Number(previousRate)
    return Math.pow(growth, yearSeconds / roundDurationSeconds) - 1
}

export async function getExchangeRate(reader: HipoReader): Promise<object> {
    const [state, times] = await Promise.all([reader.getTreasuryState(), reader.getTimes()])
    const rate = Number(state.totalCoins) / Number(state.totalTokens)
    const roundDuration = Number(times.nextRoundSince - times.currentRoundSince)
    const apy = computeApy(state.currentRate, state.previousRate, roundDuration)
    return {
        oneHgramInGram: rate.toFixed(9),
        oneGramInHgram: (1 / rate).toFixed(9),
        totalCoinsGram: formatGram(state.totalCoins),
        totalTokensHgram: formatGram(state.totalTokens),
        recentApy: apy == null ? 'unavailable (previous round rate not set)' : formatPercent(apy),
        apyNote:
            'APY is derived from the last on-chain rate update (current_rate / previous_rate compounded to a year). ' +
            'Rewards accrue in the exchange rate: hGRAM becomes worth more GRAM over time; there is no separate claim.',
        disclaimer,
    }
}

export async function getTreasuryState(reader: HipoReader): Promise<object> {
    const state = await reader.getTreasuryState()
    const participations: object[] = []
    for (const roundSince of state.participations.keys()) {
        const participation = state.participations.get(roundSince)
        participations.push({
            roundSince: Number(roundSince),
            roundStart: formatTime(roundSince),
            state: participationStateName(participation?.state),
            totalStakedGram: formatGram(participation?.totalStaked ?? 0n),
            stakeHeldUntil:
                participation?.stakeHeldUntil == null || participation.stakeHeldUntil === 0n
                    ? null
                    : formatTime(participation.stakeHeldUntil),
        })
    }
    return {
        totalCoinsGram: formatGram(state.totalCoins),
        totalTokensHgram: formatGram(state.totalTokens),
        pendingDepositsGram: formatGram(state.totalStaking),
        pendingUnstakesHgram: formatGram(state.totalUnstaking),
        totalBorrowersStakeGram: formatGram(state.totalBorrowersStake),
        participations,
        halted: state.stopped,
        instantMint: state.instantMint,
        governanceFee: formatPercent(Number(state.governanceFee) / 65535),
        roundsImbalance: formatPercent((Number(state.roundsImbalance) + 1 + 256) / 512),
        disclaimer,
    }
}

export async function getRoundTiming(reader: HipoReader): Promise<object> {
    const times = await reader.getTimes()
    const roundDuration = Number(times.nextRoundSince - times.currentRoundSince)
    return {
        currentRoundStart: formatTime(times.currentRoundSince),
        currentRoundSinceUnix: Number(times.currentRoundSince),
        nextRoundStart: formatTime(times.nextRoundSince),
        nextRoundEnd: formatTime(times.nextRoundUntil),
        roundDurationSeconds: roundDuration,
        participateSince: formatTime(times.participateSince),
        participateUntil: formatTime(times.participateUntil),
        stakeHeldForSeconds: Number(times.stakeHeldFor),
        notes: [
            'TON validation rounds are consecutive; rewards land when a round finishes recovering its stakes.',
            'A deferred deposit mints hGRAM when the latest committed round finishes; a deferred unstake pays out at the earliest round end.',
            'Stakes stay frozen for stake_held_for seconds after a round ends before they can be recovered.',
        ],
        disclaimer,
    }
}

export async function getFees(reader: HipoReader): Promise<object> {
    const fees = await reader.getTreasuryFees(0n)
    return {
        depositCoinsFeeGram: formatGram(fees.depositCoinsFee),
        unstakeAllTokensFeeGram: formatGram(fees.unstakeAllTokensFee),
        requestLoanFeeGram: formatGram(fees.requestLoanFee),
        notes: [
            'Fees are gas prepayments, not protocol fees; there is no fee taken from the staked amount.',
            'Deposit: attach the deposit fee on top of the staked amount; the unused gas returns shortly after as a separate excess transfer.',
            'Unstake: attach the unstake fee with the token burn; little or none returns at request time — the unused remainder is paid out together with the final GRAM withdrawal, so a raw withdrawal payout slightly overstates the pure staking reward.',
            'To measure a wallet’s real return, net all flows per cycle: (deposits sent − deposit refunds) versus (request-time refunds + withdrawal payout).',
        ],
        disclaimer,
    }
}

export async function getWalletStatus(reader: HipoReader, owner: Address): Promise<object> {
    const [status, state] = await Promise.all([reader.getWalletStatus(owner), reader.getTreasuryState()])
    const rate = Number(state.totalCoins) / Number(state.totalTokens)
    const valueGram = (Number(status.tokens) / 1e9) * rate
    return {
        deployed: status.deployed,
        hgramBalance: formatGram(status.tokens),
        approximateValueGram: valueGram.toFixed(9),
        pendingStakes: status.staking.map((s) => ({
            roundSince: Number(s.roundSince),
            roundStart: formatTime(s.roundSince),
            coinsGram: formatGram(s.coins),
        })),
        pendingUnstakeHgram: formatGram(status.unstaking),
        note: status.deployed
            ? 'Pending stakes mint hGRAM when their round finishes; pending unstakes pay out GRAM at the rate current when their bill burns. The unstake payout also carries the unused part of the unstake gas prepayment, so the incoming transfer is stake value plus gas remainder, not reward alone.'
            : 'No hGRAM wallet is deployed for this address yet.',
        disclaimer,
    }
}

// The rewards API reports the Hipo Club level zero-indexed, while the Hipo app
// shows levels starting at 1, so a raw club_level of 6 is "Club Level 7" to the
// user. reward_coefficients is a per-level list in that same zero-indexed order,
// so the wallet's own coefficient is resolved here, before the level is shifted:
// after shifting, reward_coefficients[club_level] would name the tier above.
export function normalizeClubLevel(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) {
        return result
    }
    const { club_level: rawLevel, ...rest } = result as Record<string, unknown>
    if (typeof rawLevel !== 'number') {
        return result
    }
    const coefficients = rest['reward_coefficients']
    return {
        club_level: rawLevel + 1,
        club_level_reward_coefficient: Array.isArray(coefficients) ? (coefficients[rawLevel] ?? null) : null,
        ...rest,
    }
}

export async function getRewardHistory(rewardsApiBase: string | undefined, owner: Address): Promise<object> {
    if (rewardsApiBase == null || rewardsApiBase === '') {
        return {
            error: 'reward history is not configured on this server (set HIPO_REWARDS_API_BASE to the Hipo rewards API base URL)',
            hint: 'Use get_wallet_status for the current position, or stats.hipo.finance for historical charts.',
        }
    }
    const url = `${rewardsApiBase.replace(/\/$/, '')}/wallet-rewards?address=${encodeURIComponent(owner.toString())}`
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
        throw new Error(`rewards API returned ${response.status.toString()}`)
    }
    const body = (await response.json()) as { ok?: boolean; result?: unknown; error?: unknown }
    if (body.ok !== true) {
        throw new Error(`rewards API error: ${JSON.stringify(body.error ?? body)}`)
    }
    return {
        rewards: normalizeClubLevel(body.result),
        note:
            'Per-round rewards from the Hipo rewards API, including Hipo Club HPO rewards where applicable. ' +
            'club_level is reported the way the Hipo app shows it, starting at level 1, and applies to the current Hipo Club season (seasons run for months, not per round). ' +
            'reward_coefficients lists every level in order starting at level 1; club_level_reward_coefficient is the one that applies to this wallet.',
        disclaimer,
    }
}

export async function getParticipation(reader: HipoReader, roundSince: bigint | undefined): Promise<object> {
    const effectiveRound = roundSince ?? (await reader.getTimes()).currentRoundSince
    const participation: Participation = await reader.getParticipation(effectiveRound)
    return {
        roundSince: Number(effectiveRound),
        roundStart: formatTime(effectiveRound),
        state: participationStateName(participation.state),
        loanRequests: participation.requests?.size ?? 0,
        acceptedLoans: participation.accepted?.size ?? 0,
        stakedLoans: participation.staked?.size ?? 0,
        recoveringLoans: participation.recovering?.size ?? 0,
        totalStakedGram: formatGram(participation.totalStaked ?? 0n),
        totalRecoveredGram: formatGram(participation.totalRecovered ?? 0n),
        stakeHeldUntil:
            participation.stakeHeldUntil == null || participation.stakeHeldUntil === 0n
                ? null
                : formatTime(participation.stakeHeldUntil),
        disclaimer,
    }
}

export async function getLoanInfo(reader: HipoReader, borrower: Address, roundSince: bigint | undefined): Promise<object> {
    const effectiveRound = roundSince ?? (await reader.getTimes()).currentRoundSince
    const status = await reader.getLoanStatus(borrower, effectiveRound)
    return {
        loanAddress: status.address.toString(),
        roundSince: Number(effectiveRound),
        deployed: status.deployed,
        balanceGram: formatGram(status.balance),
        borrower: status.borrower?.toString() ?? null,
        elector: status.elector?.toString() ?? null,
        note: status.deployed
            ? 'The loan contract can only send its stake to the Elector; borrowers cannot withdraw loans.'
            : 'No loan contract is deployed for this borrower and round.',
        disclaimer,
    }
}

export async function getMaxPunishment(reader: HipoReader, stake: bigint): Promise<object> {
    const punishment = await reader.getMaxPunishment(stake)
    return {
        stakeGram: formatGram(stake),
        maxPunishmentGram: formatGram(punishment),
        note: 'Punishments are deducted from the borrower’s own stake first; stakers are only exposed after it is exhausted.',
        disclaimer,
    }
}
