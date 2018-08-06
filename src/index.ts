import { ApolloServer } from 'apollo-server'
import { Request } from 'express'
import fs from 'fs'
import { convert } from './convert'
import { IConfig } from './util/types'

const [node, index, configFn] = process.argv

if (!configFn) {
  console.error(`Usage: ${node} ${index} <config.json>`)
  process.exit()
}

const config = JSON.parse(fs.readFileSync(configFn).toString()) as IConfig

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
