import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import net from 'node:net'

const port = 5197
const host = '127.0.0.1'
const statePath = new URL('../.preview/server.json', import.meta.url)

async function isListening() {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

if (await isListening()) throw new Error(`Port ${port} is already in use; no server was started or stopped.`)
await mkdir(new URL('../.preview/', import.meta.url), { recursive: true })
const server = await createServer({ server: { host, port, strictPort: true }, logLevel: 'error' })
const record = { pid: process.pid, port, startedAt: new Date().toISOString(), stopped: false }

try {
  await server.listen()
  await writeFile(statePath, JSON.stringify(record, null, 2))
  console.log(`Temporary preview: PID ${process.pid}, port ${port}`)
  const runner = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit', windowsHide: true,
  })
  process.exitCode = await new Promise((resolve, reject) => {
    runner.once('error', reject)
    runner.once('exit', (code) => resolve(code ?? 1))
  })
} finally {
  await server.close()
  if (await isListening()) throw new Error(`Task preview port ${port} was not released.`)
  record.stopped = true
  await writeFile(statePath, JSON.stringify(record, null, 2))
  console.log(`Temporary preview stopped; port ${port} released.`)
}
