import { ApolloServer } from 'apollo-server-express'
import cors from 'cors'
import express, { Request } from 'express'
import fs from 'fs'
import { inspect } from 'util'
import { convert } from './convert'
import { mergeConfigs } from './merge'

const [node, mainjs, ...configs] = process.argv

if (configs.length === 0) {
  console.error(`Usage: ${node} ${mainjs} <config.json> <overrides.json> ...`)
  process.exit()
}

const config = configs
  .map((filename) => JSON.parse(fs.readFileSync(filename).toString()))
  .reduce(mergeConfigs)

console.log('Final config:')
console.log(inspect(config, true, 9999, true))

const app = express()

app.use(cors())

app.get('/_internal_/healthcheck', (req, res) => {
  res.send({
    status: 'healthy'
  })
})

const server = new ApolloServer({
  schema: convert(config),
  context: ({ req }: { req: Request }) => ({
    authorization: req.headers.authorization
  }),
  tracing: true,
  introspection: true
})

server.applyMiddleware({ app })

app.listen(4000, () => console.log('http://localhost:4000'))
