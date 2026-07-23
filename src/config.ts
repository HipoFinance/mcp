import { readFileSync } from 'node:fs'
import { Address } from '@ton/ton'
import { treasuryAddresses } from '@hipo-finance/sdk'

export type Network = 'mainnet' | 'testnet'

export interface Config {
    network: Network
    toncenterEndpoint: string
    toncenterApiKey?: string
    rewardsApiBase?: string
    docsCacheSeconds: number
    stateCacheSeconds: number
}

// Reads NAME_FILE (a path, e.g. a docker secret under /run/secrets) if set,
// falling back to NAME. Empty values count as unset.
function readSecret(env: NodeJS.ProcessEnv, name: string): string | undefined {
    const file = env[`${name}_FILE`]
    if (file != null && file !== '') {
        return readFileSync(file, 'utf8').trim()
    }
    const value = env[name]
    return value == null || value === '' ? undefined : value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const network: Network = env['HIPO_NETWORK'] === 'testnet' ? 'testnet' : 'mainnet'
    const defaultEndpoint =
        network === 'testnet'
            ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
            : 'https://toncenter.com/api/v2/jsonRPC'
    return {
        network,
        toncenterEndpoint: env['TONCENTER_ENDPOINT'] ?? defaultEndpoint,
        toncenterApiKey: readSecret(env, 'TONCENTER_API_KEY'),
        rewardsApiBase: env['HIPO_REWARDS_API_BASE'] ?? 'https://api.hipogang.io',
        docsCacheSeconds: Number(env['HIPO_DOCS_CACHE_SECONDS'] ?? 300),
        stateCacheSeconds: Number(env['HIPO_STATE_CACHE_SECONDS'] ?? 5),
    }
}

export function treasuryAddress(network: Network): Address {
    const address = treasuryAddresses.get(network)
    if (address == null) {
        throw new Error(`no treasury address known for network '${network}'`)
    }
    return address
}

// The contract repository README is the source of truth for addresses:
// https://github.com/HipoFinance/contract#readme
export const docSources: { name: string; uri: string; title: string; description: string; url: string }[] = [
    {
        name: 'overview',
        uri: 'hipo://docs/overview',
        title: 'Hipo overview',
        description: 'Contract repository README: protocol summary, contract recap, mainnet addresses',
        url: 'https://raw.githubusercontent.com/HipoFinance/contract/main/README.md',
    },
    {
        name: 'architecture',
        uri: 'hipo://docs/architecture',
        title: 'Hipo architecture',
        description: 'Contracts, validation-round state machine, and protocol invariants',
        url: 'https://raw.githubusercontent.com/HipoFinance/contract/main/docs/architecture.md',
    },
    {
        name: 'integration',
        uri: 'hipo://docs/integration',
        title: 'Hipo integration guide',
        description: 'Message schemas and integration instructions for wallets and protocols',
        url: 'https://raw.githubusercontent.com/HipoFinance/contract/main/docs/integration.md',
    },
    {
        name: 'schema',
        uri: 'hipo://docs/schema',
        title: 'Hipo TL-B schemas',
        description: 'Full TL-B message schemas of all Hipo contracts',
        url: 'https://raw.githubusercontent.com/HipoFinance/contract/main/contracts/schema.tlb',
    },
    {
        name: 'knowledge',
        uri: 'hipo://docs/knowledge',
        title: 'Hipo knowledge base',
        description: 'Curated facts, naming rules, FAQ, and answer guidelines (llms.txt)',
        url: 'https://hipo.finance/llms.txt',
    },
]

export const disclaimer =
    'Live protocol data, not financial advice. Values change every validation round and no returns are guaranteed.'
