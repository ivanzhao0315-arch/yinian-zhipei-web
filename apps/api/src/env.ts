import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const envFiles = [
  new URL('../.env.local', import.meta.url),
  new URL('../.env', import.meta.url),
  new URL('../../../.env.local', import.meta.url),
]

for (const envFile of envFiles) {
  const path = fileURLToPath(envFile)
  if (existsSync(path)) {
    config({ path, override: false })
  }
}
