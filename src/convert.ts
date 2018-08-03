import got, { GotError } from 'got'
import {
  GraphQLEnumType,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
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
import { createModels } from './model'
import { astFromTypeName } from './util/ast'
import { insertMetadata, toGraphQLType } from './util/helpers'
import { IConfig } from './util/types'

/**
 * Turn `[{name: 'x', type: 1}, {name: 'y', type: 2}]` into `{'x': {type: 1}, 'y': {type: 2}}`
 */
function keysFromProp<T extends object, K extends keyof T> (objs: T[], key: K): {
  [index: string]: {
    [P in Exclude<keyof T, K>]: T[P]
  }
} {
  return _.chain(objs).keyBy(key.toString()).mapValues(omit<T, K>(key)).value()
}

export function convert (config: IConfig): GraphQLSchema {
  const types = new Map<string, GraphQLType>()
  types.set('string', GraphQLString)
  types.set('number', GraphQLInt)
  types.set('double', GraphQLFloat)

  createModels(types, config)

  // create enum types
  for (const [name, enm] of Object.entries(config.enums)) {
    types.set(name, new GraphQLEnumType({
      name,
      description: enm.description,
      values: _.chain(enm.values)
               .keyBy('name')
               .mapKeys((value, key) => key.toUpperCase())
               .mapValues((enumValue) => ({
                 value: enumValue.name,
                 description: enumValue.description
               }))
               .value()
    }))
  }

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
              return args[part.substring(1)]
            } else {
              return part
            }
          }).join('/')

          const query: {[key: string]: any} = {}

          for (const [key, param] of Object.entries(resource.many.params)) {
            if (param.required && param.default != null && args[key] == null) {
              throw new Error(`missing required param ${key}`)
            }
            // TODO: fill in default?
            if (args[key] != null) { // why?
              query[key] = args[key]
            }
          }

          const unique = _.some(resource.many.uid, (index) =>
            _.every(index, (field) => args[field] != null))

          if (!unique) {
            throw new Error('not fetching a unique item. please fill out ' +
                            resource.many.uid.map((fields) => `[${fields.join(',')}]`).join(', or '))
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
