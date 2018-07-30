import got from 'got'
import {
  getNamedType,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
  GraphQLString,
  GraphQLType,
  isListType,
  isNamedType,
  isNonNullType,
  isOutputType,
  isNullableType,
  GraphQLEnumType
} from 'graphql'
import _ from 'lodash'
import { omit } from 'lodash/fp'
import { AstNode, astFromTypeName } from './util/ast'
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

  function getMapEntryName (type: GraphQLType): string {
    if (isNamedType(type)) {
      return type.name
    }

    if (isNonNullType(type)) {
      return `Nullable${getMapEntryName(type.ofType)}`
    }

    // isListType
    return `ListOf${getMapEntryName(type.ofType)}`
  }

  const mapEntryCache = new Map<string, GraphQLObjectType>()
  // Creates types for map entries, of type string -> valueType
  // It is memoized because we can't have multiple types with the same name
  function makeMapEntry (valueType: GraphQLOutputType): GraphQLObjectType {
    const name = getMapEntryName(valueType)
    if (mapEntryCache.has(name)) {
      return mapEntryCache.get(name) as GraphQLObjectType
    }
    const type = new GraphQLObjectType({
      name: `StringTo${name}`,
      fields: {
        key: {
          type: GraphQLString
        },
        value: {
          type: valueType
        }
      }
    })
    mapEntryCache.set(name, type)
    return type
  }

  function toGraphQLType (node: AstNode): GraphQLType | undefined {
    switch (node.name) {
      case 'array': {
        const child = toGraphQLType(node.type)
        if (child && isNullableType(child)) {
          return new GraphQLList(new GraphQLNonNull(child))
        } else {
          console.error(node.type, 'is null or not a nullable type')
          return undefined
        }
      }
      case 'map': {
        const child = toGraphQLType(node.type)
        if (child && isOutputType(child)) {
          return new GraphQLList(new GraphQLNonNull(makeMapEntry(child)))
        } else {
          console.error(node.type, 'is null or not an output type')
          return undefined
        }
      }
      default: {
        return types.get(node.name)
      }
    }
  }

  for (const [name, model] of Object.entries(config.models)) {
    types.set(name, new GraphQLObjectType({
      name,
      description: model.description,
      fields: () => {
        const res: GraphQLFieldConfigMap<any, any> = {}
        for (const field of model.fields) {
          const type = toGraphQLType(astFromTypeName(field.type))
          if (type && isOutputType(type)) {
            res[field.name] = {
              type
            }
          } else {
            console.error(`error: no such type ${field.type}`)
          }
        }
        return res
      }
    }))
  }

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

  const queries: GraphQLFieldConfigMap<any, any> = {}
  for (const [name, resource] of Object.entries(config.resources)) {
    const resourceType = types.get(name)
    if (resourceType && isOutputType(resourceType)) {
      queries[name] = {
        type: resourceType,
        args:
          _
          .chain(
            keysFromProp(
              resource.many.path
                .split('/')
                .filter((p) => p[0] === ':')
                .map((p) => ({
                  name: p.substring(1),
                  type: 'string',
                  required: true
                })),
              'name'
            ) // path params as keys
          )
          .assign(resource.many.params)
          .mapValues(({ type, default: defaultValue, required }) => {
            let argType = toGraphQLType(astFromTypeName(type))
            if (argType && isNullableType(argType)) {
              if (required) {
                argType = new GraphQLNonNull(argType)
              }

              return {
                type: argType,
                defaultValue
              }
            } else {
              console.error(`error: no such nullable type ${type}`)
              return null
            }
          })
          .pickBy((x) => x != null) // filter out args that errored
          .value() as GraphQLFieldConfigArgumentMap,
        resolve: (source, args, context, info) => {
          // got()
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
