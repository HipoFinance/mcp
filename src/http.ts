import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { loadConfig } from './config.js'
import { TonReader } from './reader.js'
import { buildServer } from './server.js'

const config = loadConfig()
const reader = new TonReader(config)
const port = Number(process.env['PORT'] ?? 3000)
const host = process.env['HOST'] ?? '0.0.0.0'

const app = express()
app.use(express.json({ limit: '1mb' }))

// Stateless mode: a fresh server + transport per request, no session tracking.
// Fits the read-only tool surface and keeps the hosted deployment horizontally scalable.
app.post('/mcp', (req, res) => {
    void (async () => {
        const server = buildServer(reader, config)
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        })
        res.on('close', () => {
            void transport.close()
            void server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
    })().catch((error: unknown) => {
        console.error('request failed:', error)
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'internal server error' },
                id: null,
            })
        }
    })
})

// Stateless server: no SSE stream to resume and no session to delete.
app.get('/mcp', (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'method not allowed: this server is stateless, POST /mcp only' },
        id: null,
    })
})
app.delete('/mcp', (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'method not allowed: this server is stateless, POST /mcp only' },
        id: null,
    })
})

app.get('/healthz', (_req, res) => {
    res.status(200).send('ok')
})

app.listen(port, host, () => {
    console.error(
        `hipo-mcp: serving Hipo ${config.network} on http://${host}:${port.toString()}/mcp (toncenter: ${config.toncenterEndpoint})`,
    )
})
