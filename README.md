# Hipo MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server for [Hipo](https://hipo.finance), the open-source liquid staking protocol on the TON blockchain. It lets any MCP-capable AI client (Claude, Claude Code, Cursor, and others) read Hipo's documentation and query live on-chain data — the hGRAM/GRAM exchange rate, treasury state, validation-round timing, wallet staking status, and more.

The server is strictly **read-only**: it holds no keys, sends no messages, and only calls contract getters and public HTTP endpoints.

## Connecting

### Hosted (recommended)

Add the remote server to your MCP client:

> https://mcp.hipo.finance/mcp

For example, in Claude Code:

```sh
claude mcp add --transport http hipo https://mcp.hipo.finance/mcp
```

### Local (stdio)

Requires Node.js 20+:

```sh
claude mcp add hipo -- npx -y @hipo-finance/mcp
```

Or in a `mcpServers` configuration:

```json
{
    "mcpServers": {
        "hipo": {
            "command": "npx",
            "args": ["-y", "@hipo-finance/mcp"]
        }
    }
}
```

## Tools

| Tool | Description |
| --- | --- |
| `get_exchange_rate` | Current hGRAM↔GRAM rate, plus recent APY derived from on-chain rate updates |
| `get_treasury_state` | TVL, hGRAM supply, pending deposits/unstakes, round participations, governance parameters |
| `get_round_timing` | Current/next validation round boundaries, election window, stake freeze duration |
| `get_fees` | Current gas fees for deposit, unstake, and loan requests |
| `get_wallet_status` | A user's hGRAM balance, its GRAM value, and pending stakes/unstakes |
| `get_reward_history` | A user's historical staking rewards (requires the rewards API to be configured) |
| `get_participation` | Hipo's participation in a validation round (state, loans, totals) |
| `get_loan_info` | A borrower's per-round loan contract |
| `get_max_punishment` | Maximum punishment for a given validator stake |

## Resources

| URI | Content |
| --- | --- |
| `hipo://docs/overview` | Contract repository README (protocol summary, addresses) |
| `hipo://docs/architecture` | Contracts, round state machine, protocol invariants |
| `hipo://docs/integration` | Message schemas and integration guide |
| `hipo://docs/schema` | Full TL-B schemas |
| `hipo://docs/knowledge` | Curated knowledge base (llms.txt) |

Documents are fetched from their canonical public locations and cached briefly, so they are always current.

## Configuration

All configuration is optional; defaults target mainnet through public toncenter.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `TONCENTER_ENDPOINT` | `https://toncenter.com/api/v2/jsonRPC` | TON HTTP API endpoint |
| `TONCENTER_API_KEY` | (none) | toncenter API key; without one the public rate limit applies |
| `HIPO_NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `HIPO_REWARDS_API_BASE` | (none) | Base URL of the Hipo rewards API; enables `get_reward_history` |
| `HIPO_DOCS_CACHE_SECONDS` | `300` | Docs resource cache TTL |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP transport only |

## Development

```sh
npm install
npm run build
npm test            # unit tests (mocked chain access)
node dist/stdio.js  # stdio transport
node dist/http.js   # Streamable HTTP transport on :3000/mcp
```

### Docker

```sh
docker build -t hipo-mcp .
docker run -p 3000:3000 -e TONCENTER_API_KEY=... hipo-mcp
```

## Source of truth

Contract addresses and protocol documentation come from the [contract repository](https://github.com/HipoFinance/contract); its README is the source of truth for deployed addresses. Live numbers are read from contract getters — this server never re-implements protocol math.

## License

MIT
