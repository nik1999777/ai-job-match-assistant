import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: './openapi.json',
    output: {
      target: './src/api/generated.ts',
      client: 'react-query',
      override: {
        // analyze endpoint uses SSE — skip generating a hook for it, keep only types
        operationsFilter: /^(?!analyze).*/,
        query: {
          useQuery: false,
          useMutation: true,
        },
      },
    },
  },
})
