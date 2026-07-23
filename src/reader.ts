import { Address, TonClient } from '@ton/ton'
import { Parent, Participation, Treasury, TreasuryConfig, TreasuryFees, Times, Wallet } from '@hipo-finance/sdk'
import { Config, treasuryAddress } from './config.js'

export type { TreasuryFees } from '@hipo-finance/sdk'

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
    private readonly treasury: Treasury

    constructor(config: Config) {
        this.client = new TonClient({
            endpoint: config.toncenterEndpoint,
            apiKey: config.toncenterApiKey,
        })
        this.treasury = Treasury.createFromAddress(treasuryAddress(config.network))
    }

    private openTreasury() {
        return this.client.open(this.treasury)
    }

    async getTimes(): Promise<Times> {
        return await this.openTreasury().getTimes()
    }

    async getTreasuryState(): Promise<TreasuryConfig> {
        return await this.openTreasury().getTreasuryState()
    }

    async getTreasuryFees(ownershipAssignedAmount: bigint): Promise<TreasuryFees> {
        return await this.openTreasury().getTreasuryFees(ownershipAssignedAmount)
    }

    async getParticipation(roundSince: bigint): Promise<Participation> {
        return await this.openTreasury().getParticipation(roundSince)
    }

    async getMaxPunishment(stake: bigint): Promise<bigint> {
        return await this.openTreasury().getMaxPunishment(stake)
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
        const loanAddress = await this.openTreasury().getLoanAddress(borrower, roundSince)
        const provider = this.client.provider(loanAddress)
        const contractState = await provider.getState()
        if (contractState.state.type !== 'active') {
            return { address: loanAddress, deployed: false, balance: contractState.balance }
        }
        // Loan state layout mirrors wrappers/Loan.ts in the contract repo:
        // elector, treasury, borrower, round_since.
        const { stack } = await provider.get('get_loan_state', [])
        const elector = stack.readAddress()
        stack.readAddress() // treasury
        const loanBorrower = stack.readAddress()
        const loanRoundSince = stack.readBigNumber()
        return {
            address: loanAddress,
            deployed: true,
            balance: contractState.balance,
            elector,
            borrower: loanBorrower,
            roundSince: loanRoundSince,
        }
    }
}
