#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { TonReader } from './reader.js'
import { buildServer } from './server.js'

const config = loadConfig()
const server = buildServer(new TonReader(config), config)
await server.connect(new StdioServerTransport())
console.error(`hipo-mcp: serving Hipo ${config.network} over stdio (toncenter: ${config.toncenterEndpoint})`)
