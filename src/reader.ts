import { Address, Dictionary, TonClient, TupleBuilder } from '@ton/ton'
import {
    Parent,
    Participation,
    Treasury,
    TreasuryConfig,
    Times,
    Wallet,
    requestDictionaryValue,
    sortedDictionaryValue,
} from '@hipo-finance/sdk'
import { Config, treasuryAddress } from './config.js'

export interface TreasuryFees {
    requestLoanFee: bigint
    depositCoinsFee: bigint
    unstakeAllTokensFee: bigint
}

export interface WalletStatus {
    deployed: boolean
    tokens: bigint
    staking: { roundSince: bigint; coins: bigint }[]
    unstaking: bigint
}

export interface LoanStatus {
    address: Address
    deployed: boolean
    balance: bigint
    elector?: Address
    borrower?: Address
    roundSince?: bigint
}

// Read-only access to Hipo state. All numbers come from contract getters —
// nothing here re-implements protocol math (see the spec's invariants section).
export interface HipoReader {
    getTimes(): Promise<Times>
    getTreasuryState(): Promise<TreasuryConfig>
    getTreasuryFees(ownershipAssignedAmount: bigint): Promise<TreasuryFees>
    getParticipation(roundSince: bigint): Promise<Participation>
    getMaxPunishment(stake: bigint): Promise<bigint>
    getWalletStatus(owner: Address): Promise<WalletStatus>
    getLoanStatus(borrower: Address, roundSince: bigint): Promise<LoanStatus>
}

export class TonReader implements HipoReader {
    private readonly client: TonClient
    private readonly treasury: Address

    constructor(config: Config) {
        this.client = new TonClient({
            endpoint: config.toncenterEndpoint,
            apiKey: config.toncenterApiKey,
        })
        this.treasury = treasuryAddress(config.network)
    }

    async getTimes(): Promise<Times> {
        return await this.client.open(Treasury.createFromAddress(this.treasury)).getTimes()
    }

    async getTreasuryState(): Promise<TreasuryConfig> {
        return await this.client.open(Treasury.createFromAddress(this.treasury)).getTreasuryState()
    }

    async getTreasuryFees(ownershipAssignedAmount: bigint): Promise<TreasuryFees> {
        const tb = new TupleBuilder()
        tb.writeNumber(ownershipAssignedAmount)
        const { stack } = await this.client.provider(this.treasury).get('get_treasury_fees', tb.build())
        return {
            requestLoanFee: stack.readBigNumber(),
            depositCoinsFee: stack.readBigNumber(),
            unstakeAllTokensFee: stack.readBigNumber(),
        }
    }

    // Stack layout mirrors wrappers/Treasury.ts getParticipation in the contract repo.
    async getParticipation(roundSince: bigint): Promise<Participation> {
        const tb = new TupleBuilder()
        tb.writeNumber(roundSince)
        const { stack } = await this.client.provider(this.treasury).get('get_participation', tb.build())
        return {
            state: stack.readNumber(),
            size: stack.readBigNumber(),
            sorted: Dictionary.loadDirect(Dictionary.Keys.BigUint(112), sortedDictionaryValue, stack.readCellOpt()),
            requests: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            rejected: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            accepted: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            accrued: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            staked: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            recovering: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(256),
                requestDictionaryValue,
                stack.readCellOpt(),
            ),
            totalStaked: stack.readBigNumber(),
            totalRecovered: stack.readBigNumber(),
            currentVsetHash: stack.readBigNumber(),
            stakeHeldFor: stack.readBigNumber(),
            stakeHeldUntil: stack.readBigNumber(),
        }
    }

    async getMaxPunishment(stake: bigint): Promise<bigint> {
        const tb = new TupleBuilder()
        tb.writeNumber(stake)
        const { stack } = await this.client.provider(this.treasury).get('get_max_punishment', tb.build())
        return stack.readBigNumber()
    }

    async getWalletStatus(owner: Address): Promise<WalletStatus> {
        const state = await this.getTreasuryState()
        if (state.parent == null) {
            throw new Error('treasury has no parent set')
        }
        const walletAddress = await this.client.open(Parent.createFromAddress(state.parent)).getWalletAddress(owner)
        const contractState = await this.client.provider(walletAddress).getState()
        if (contractState.state.type !== 'active') {
            return { deployed: false, tokens: 0n, staking: [], unstaking: 0n }
        }
        const walletState = await this.client.open(Wallet.createFromAddress(walletAddress)).getWalletState()
        const staking: { roundSince: bigint; coins: bigint }[] = []
        for (const roundSince of walletState.staking.keys()) {
            staking.push({ roundSince, coins: walletState.staking.get(roundSince) ?? 0n })
        }
        return { deployed: true, tokens: walletState.tokens, staking, unstaking: walletState.unstaking }
    }

    async getLoanStatus(borrower: Address, roundSince: bigint): Promise<LoanStatus> {
        const tb = new TupleBuilder()
        tb.writeAddress(borrower)
        tb.writeNumber(roundSince)
        const { stack } = await this.client.provider(this.treasury).get('get_loan_address', tb.build())
        const loanAddress = stack.readAddress()
        const provider = this.client.provider(loanAddress)
        const contractState = await provider.getState()
        if (contractState.state.type !== 'active') {
            return { address: loanAddress, deployed: false, balance: contractState.balance }
        }
        const { stack: loanStack } = await provider.get('get_loan_state', [])
        return {
            address: loanAddress,
            deployed: true,
            balance: contractState.balance,
            elector: loanStack.readAddress(),
            treasury: loanStack.readAddress(),
            borrower: loanStack.readAddress(),
            roundSince: loanStack.readBigNumber(),
        } as LoanStatus & { treasury: Address }
    }
}
