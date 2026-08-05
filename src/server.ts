import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Config, docSources } from './config.js'
import { parseAddress, parseGram } from './format.js'
import * as protocol from './protocol.js'
import { HipoReader } from './reader.js'
import { fetchDoc } from './resources.js'

function asText(result: object): { content: { type: 'text'; text: string }[] } {
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

function asError(error: unknown): { content: { type: 'text'; text: string }[]; isError: true } {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

async function run(fn: () => Promise<object>) {
    try {
        return asText(await fn())
    } catch (error) {
        return asError(error)
    }
}

export function buildServer(reader: HipoReader, config: Config): McpServer {
    const server = new McpServer({ name: 'hipo', version: '0.1.1' })

    for (const doc of docSources) {
        server.registerResource(
            doc.name,
            doc.uri,
            { title: doc.title, description: doc.description, mimeType: 'text/markdown' },
            async (uri) => ({
                contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await fetchDoc(doc.url, config.docsCacheSeconds) }],
            }),
        )
    }

    server.registerTool(
        'get_exchange_rate',
        {
            title: 'hGRAM/GRAM exchange rate',
            description:
                'Current hGRAM↔GRAM exchange rate of the Hipo liquid staking protocol, with the recent APY derived from on-chain rate updates.',
            inputSchema: {},
        },
        () => run(() => protocol.getExchangeRate(reader)),
    )

    server.registerTool(
        'get_treasury_state',
        {
            title: 'Treasury state',
            description:
                'Hipo treasury totals: TVL in GRAM, hGRAM supply, pending deposits/unstakes, active validation-round participations, halt flag, and governance parameters.',
            inputSchema: {},
        },
        () => run(() => protocol.getTreasuryState(reader)),
    )

    server.registerTool(
        'get_round_timing',
        {
            title: 'Validation round timing',
            description:
                'TON validation round timing as seen by Hipo: current/next round boundaries, election participation window, stake freeze duration, and when rewards or deferred deposits/unstakes settle.',
            inputSchema: {},
        },
        () => run(() => protocol.getRoundTiming(reader)),
    )

    server.registerTool(
        'get_fees',
        {
            title: 'Protocol fees',
            description: 'Current Hipo gas fees for deposit, unstake, and loan requests (prepayments; excess is returned).',
            inputSchema: {},
        },
        () => run(() => protocol.getFees(reader)),
    )

    server.registerTool(
        'get_wallet_status',
        {
            title: 'Wallet staking status',
            description:
                "A user's Hipo position: hGRAM balance and its GRAM value, plus pending (deferred) stakes and unstakes. Input is the user's TON address (not the jetton wallet address).",
            inputSchema: { address: z.string().describe('TON address of the user (owner), any standard form') },
        },
        ({ address }) => run(() => protocol.getWalletStatus(reader, parseAddress(address, 'address'))),
    )

    server.registerTool(
        'get_reward_history',
        {
            title: 'Reward history',
            description:
                "A user's historical Hipo staking rewards per validation round, plus Hipo Club level and HPO rewards, from the Hipo rewards API. Club levels are seasonal (seasons run for months) and are reported starting at level 1, matching the Hipo app.",
            inputSchema: { address: z.string().describe('TON address of the user (owner), any standard form') },
        },
        ({ address }) => run(() => protocol.getRewardHistory(config.rewardsApiBase, parseAddress(address, 'address'))),
    )

    server.registerTool(
        'get_participation',
        {
            title: 'Round participation',
            description:
                "Hipo's participation in a validation round: state machine stage, loan request/accepted/staked counts, totals, and stake release time. Defaults to the current round.",
            inputSchema: {
                round_since: z
                    .number()
                    .int()
                    .optional()
                    .describe('Round start unix time (validator-set utime_since); omit for the current round'),
            },
        },
        ({ round_since }) =>
            run(() => protocol.getParticipation(reader, round_since == null ? undefined : BigInt(round_since))),
    )

    server.registerTool(
        'get_loan_info',
        {
            title: 'Loan info',
            description:
                "A borrower's per-round loan contract: address, deployment state, balance, and parties. Defaults to the current round.",
            inputSchema: {
                borrower: z.string().describe('TON address of the borrower'),
                round_since: z
                    .number()
                    .int()
                    .optional()
                    .describe('Round start unix time (validator-set utime_since); omit for the current round'),
            },
        },
        ({ borrower, round_since }) =>
            run(() =>
                protocol.getLoanInfo(
                    reader,
                    parseAddress(borrower, 'borrower'),
                    round_since == null ? undefined : BigInt(round_since),
                ),
            ),
    )

    server.registerTool(
        'get_max_punishment',
        {
            title: 'Max punishment',
            description:
                'Maximum punishment the protocol can apply for a given validator stake, per current network parameters (deducted from the borrower’s own stake first).',
            inputSchema: { stake: z.string().describe('Stake amount in GRAM, e.g. "300000" or "1.5"') },
        },
        ({ stake }) => run(() => protocol.getMaxPunishment(reader, parseGram(stake))),
    )

    return server
}
