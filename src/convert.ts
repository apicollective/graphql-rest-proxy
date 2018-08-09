import got, { GotError } from 'got'
import {
  GraphQLBoolean,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLType,
  isNullableType,
  isOutputType
} from 'graphql'
import _ from 'lodash'
import { omit } from 'lodash/fp'
import { createEnums } from './enums'
import { createModels } from './model'
import { createUnions } from './unions'
import {
  astFromTypeName,
  GraphQLDate,
  GraphQLDateTime,
  GraphQLJSON,
  GraphQLLong,
  GraphQLObject,
  GraphQLUnit,
  IConfig,
  insertMetadata,
  toGraphQLType
} from './util'

export function convert (config: IConfig): GraphQLSchema {
  const types = new Map<string, GraphQLType>([
    ['boolean', GraphQLBoolean],
    ['date-iso8601', GraphQLDate],
    ['date-time-iso8601', GraphQLDateTime],
    ['double', GraphQLFloat],
    ['integer', GraphQLInt],
    ['json', GraphQLJSON],
    ['long', GraphQLLong],
    ['string', GraphQLString],
    ['object', GraphQLObject],
    ['unit', GraphQLUnit],
    ['uuid', GraphQLID]
  ])

  createModels(types, config)
  createEnums(types, config)
  createUnions(types, config)

  // create queries
  const queries: GraphQLFieldConfigMap<any, any> = {}
  for (const [name, resource] of Object.entries(config.resources)) {
    const resourceType = types.get(name)
    if (resourceType && isOutputType(resourceType)) {
      queries[name] = {
        type: resourceType,
        args:
         _.chain(resource.many.path)
          .split('/')
          .filter((p) => p[0] === ':')
          .map((p) => ({
            name: p.substring(1),
            type: 'string',
            required: true
          }))
          .keyBy('name')
          .mapValues(omit('name')) // turn path parts into same format as args
          .assign(resource.many.params)
          .mapValues(({ type, default: defaultValue, required }) => {
            let argType = toGraphQLType(astFromTypeName(type), types)
            if (argType != null && isNullableType(argType)) {
              if (required) {
                argType = new GraphQLNonNull(argType)
              }

              return {
                type: argType,
                defaultValue
              }
            } else {
              throw new Error(`no such nullable type ${type}`)
            }
          })
          .value() as GraphQLFieldConfigArgumentMap,
        resolve: async (source, args, context) => {
          const parts = resource.many.path.split('/')
          const filled = parts.map((part) => {
            if (part[0] === ':') {
              return args[part.substring(1)] // TODO: strip file extensions
            } else {
              return part
            }
          }).join('/')

          const query: {[key: string]: any} = {}

          for (const [key, param] of Object.entries(resource.many.params)) {
            if (param.required && param.default != null && args[key] == null) {
              throw new Error(`missing required param ${key}`)
            }
            if (args[key] != null) { // needed?
              query[key] = args[key]
            }
          }

          console.log(`GET ${config.base_url}${filled}?${Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')}`)

          try {
            const response = await got(`${config.base_url}${filled}`, {
              query,
              headers: {
                authorization: context.authorization
              }
            })
            const data = JSON.parse(response.body)
            console.log(data)
            if (!Array.isArray(data)) {
              throw new Error('did not receive an array')
            }
            if (data.length > 1) {
              throw new Error('received more than 1 object')
            }
            return insertMetadata(data[0], {
              __args: args,
              __parent: source
            })
          } catch (e) {
            if ('response' in e) {
              const err: GotError = e
              throw new Error(err.response.body)
            } else {
              throw e
            }
          }
        }
      }
    } else {
      console.error(`error: no such type ${name}`)
    }
  }

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'RootQueryType',
      fields: queries
    })
  })
  return schema
}
