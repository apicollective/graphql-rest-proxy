import { ApolloServer } from 'apollo-server'
import { Request } from 'express'
import fs from 'fs'
import { inspect } from 'util'
import { convert } from './convert'
import { mergeConfigs } from './merge'

const [node, mainjs, ...configs] = process.argv

if (!configs) {
  console.error(`Usage: ${node} ${mainjs} <config.json> <overrides.json> ...`)
  process.exit()
}

const config = configs
  .map((filename) => JSON.parse(fs.readFileSync(filename).toString()))
  .reduce(mergeConfigs)

console.log('Final config:')
console.log(inspect(config, true, 9999, true))

const server = new ApolloServer({
  schema: convert(config),
  context: ({ req }: { req: Request }) => ({
    authorization: req.headers.authorization
  }),
  tracing: true
})

server.listen().then(({ url }) => {
  console.log(`${url}`)
})
