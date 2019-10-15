import got from 'got'
import {
  GraphQLBoolean,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLType,
  isNullableType,
  isOutputType
} from 'graphql'
import jsonpath from 'jsonpath'
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
  makeError,
  parseDefault,
  toGraphQLType
} from './util'

export function convert (config: IConfig): GraphQLSchema {
  if (config.base_url == null) {
    throw new Error('missing base_url')
  }

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
  for (const [name, resource] of Object.entries(config.resources || {})) {
    const resourceType = types.get(name)
    if (resourceType && isOutputType(resourceType)) {
      const getter = resource.many || resource.one
      const many = resource.many != null

      queries[name] = {
        type: many
        ? new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(resourceType)))
        : new GraphQLNonNull(resourceType), // should this be nullable? handle 404s
        args:
         _.chain(getter.path)
          .split(/[/.]/)
          .filter((p) => p[0] === ':')
          .map((p) => ({
            name: p.substring(1),
            type: 'string',
            required: true
          }))
          .keyBy('name')
          .mapValues(omit('name')) // turn path parts into same format as args
          .assign(getter.params)
          .mapValues(({ type, default: defaultValue, required }) => {
            let argType = toGraphQLType(astFromTypeName(type), types)
            if (argType != null && isNullableType(argType)) {
              if (required) {
                argType = new GraphQLNonNull(argType)
              }

              return {
                type: argType,
                defaultValue: parseDefault(type, defaultValue)
              }
            } else {
              throw new Error(`no such nullable type ${type}`)
            }
          })
          .value() as GraphQLFieldConfigArgumentMap,
        resolve: async (source, args, context) => {
          const parts = getter.path.split('/')
          const filled = parts.map((part) => {
            if (part[0] === ':') {
              return args[part.substring(1)] // TODO: strip file extensions
            } else {
              return part
            }
          }).join('/')

          let query = ""

          for (const [key, param] of Object.entries(getter.params || {})) {
            if (param.required && param.default != null && args[key] == null) {
              throw new Error(`missing required param ${key}`)
            }
            if (Array.isArray(args[key])) {
              for (const value of args[key]) {
                if (value != null) {
                  if (query !== "") {
                    query += "&"
                  }
                  query += `${key}=${value}` // TODO: Escape
                }
              }
            } else if (args[key] != null) {
              if (query !== "") {
                query += "&"
              }
              query += `${key}=${args[key]}` // TODO: Escape
            }
          }

          let fullUrl = `${config.base_url}${filled}`
          if (query !== "") {
            fullUrl += `?${query}`
          }
          console.log(`GET ${fullUrl}`)

          try {
            const response = await got(`${config.base_url}${filled}`, {
              query,
              headers: {
                authorization: context.authorization
              }
            })
            let data = JSON.parse(response.body)
            if (process.env.NODE_ENV !== 'production') {
              console.log(data) // data is potentially sensitive
            }
            if (getter.extract != null) {
              const results = jsonpath.query(data, getter.extract)
              if (results.length === 0) {
                throw new Error(`tried to extract ${getter.extract} from data, but did not match anything`)
              } else if (results.length > 1) {
                throw new Error(`tried to extract ${getter.extract} from data, ` +
                                `but matched more than 1 item - ${results}`)
              } else {
                data = results[0]
              }
            }

            if (many) {
              if (!Array.isArray(data)) {
                throw new Error('did not receive an array')
              }
              return data.map((elem) => insertMetadata(elem, {
                __args: args,
                __parent: source
              }))
            } else {
              return insertMetadata(data, {
                __args: args,
                __parent: source
              })
            }
          } catch (e) {
            throw makeError(e, fullUrl)
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
