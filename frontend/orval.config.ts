import { defineConfig } from 'orval'

export default defineConfig({
  eproshno: {
    input: {
      target: 'http://localhost:5080/swagger/v1/swagger.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/lib/api/generated',
      schemas: 'src/lib/api/model',
      client: 'react-query',
      override: {
        mutator: {
          path: './src/lib/api-client.ts',
          name: 'customInstance',
        },
      },
    },
  },
})

