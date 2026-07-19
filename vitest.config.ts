import { defineConfig } from 'vitest/config'
import { vitestPoolWorkers } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  test: {
    pool: vitestPoolWorkers,
    environment: 'miniflare',
    coverage: {
      provider: 'v8'
    }
  }
})