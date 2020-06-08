import { ApolloError } from 'apollo-server-core'
import assert from 'assert'
import { HTTPError } from 'got'
import {
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLString,
  GraphQLType,
  isNamedType,
  isNonNullType,
  isNullableType,
  isObjectType,
  isOutputType
} from 'graphql'
import { camelCase, upperFirst } from 'lodash'
import { AstNode } from './ast'

export function searchArgs (obj: any | undefined, key: string): any {
  if (obj === undefined) {
    return undefined
  }

  if (obj.__args[key]) {
    return obj.__args[key]
  }

  return searchArgs(obj.__parent, key)
}

export function insertMetadata (obj: any, data: object): any {
  if (obj == null) {
    return obj
  } else if (Array.isArray(obj)) {
    return obj.map((elem) => insertMetadata(elem, data))
  } else if (typeof obj === 'object') {
    const transformed = Object.keys(obj).reduce((newobj, key) => {
      newobj[key] = insertMetadata(obj[key], data)
      return newobj
    }, {} as any)
    return Object.assign({}, transformed, data)
  } else {
    return obj
  }
}

export function graphQLTypeName (type: GraphQLType): string {
  const prefix = 'Nullable'

  if (isNamedType(type)) {
    return prefix + upperFirst(camelCase(type.name))
  }

  if (isNonNullType(type)) {
    const child = graphQLTypeName(type.ofType)
    assert(child.startsWith(prefix))
    return child.substring(prefix.length) // strip 'Nullable'
  }

  return `NullableListOf${graphQLTypeName((type as GraphQLList<any>).ofType)}`
}

const mapEntryCache = new Map<string, GraphQLObjectType>()
// Creates types for map entries, of type string -> valueType
// It is memoized because we can't have multiple types with the same name
function makeMapEntry (valueType: GraphQLOutputType): GraphQLObjectType {
  const name = graphQLTypeName(valueType)
  if (mapEntryCache.has(name)) {
    return mapEntryCache.get(name) as GraphQLObjectType
  }
  const type = new GraphQLObjectType({
    name: `StringTo${name}`,
    fields: {
      key: {
        type: new GraphQLNonNull(GraphQLString)
      },
      value: {
        type: valueType
      }
    }
  })
  mapEntryCache.set(name, type)
  return type
}

export function toGraphQLType (node: AstNode, types: Map<string, GraphQLType>): GraphQLType | undefined {
  switch (node.name) {
    case 'array': {
      const child = toGraphQLType(node.type, types)
      if (child != null && isNullableType(child)) {
        return new GraphQLList(new GraphQLNonNull(child))
      } else {
        console.error(node.type, 'is null or not a nullable type')
        return undefined
      }
    }
    case 'map': {
      const child = toGraphQLType(node.type, types)
      if (child != null && isOutputType(child)) {
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

export function makeError (err: any, fullUrl: string) {
  if (err instanceof HTTPError) {
    const body = err.response.rawBody.toString()
    try {
      // a full flow error
      const data = JSON.parse(body)
      if (process.env.NODE_ENV !== 'production') {
        console.log(data)
      }

      return new ApolloError(
        data.messages[0], // api-build requires a messages[] field
        data.code, // api-build requires a code field
        {
          ...data,
          code: undefined,
          url: fullUrl
        }
      )
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.log(body)
      }
      // some other error from the web service, and not JSON
      return new ApolloError(body, err.response.statusCode.toString(), {
        url: fullUrl
      })
    }
  } else {
    // not an error returned by got(), e.g. 4xx or 5xx
    return err
  }
}

export function parseDefault (type: string, defaultValue: any) {
  if (defaultValue == null) {
    return undefined
  }

  if (type === 'integer' || type === 'long') {
    return parseInt(defaultValue, 10)
  } else if (type === 'double') {
    return parseFloat(defaultValue)
  } else {
    return defaultValue
  }
}
