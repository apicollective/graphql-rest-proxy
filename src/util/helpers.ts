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
  isOutputType
} from 'graphql'
import { AstNode } from './ast'

export function searchParent (obj: any | undefined, key: string): any {
  if (obj === undefined) {
    return undefined
  }

  if (obj.__args[key]) {
    return obj.__args[key]
  }

  if (obj.__parent && obj.__parent[key]) {
    return obj.__parent[key]
  }

  return searchParent(obj.__parent, key)
}

export function searchContext (obj: any | undefined, key: string) {
  if (obj === undefined) {
    return undefined
  }

  if (obj.__args[key]) {
    return obj.__args[key]
  }

  if (obj.__parent && obj.__parent[key]) {
    return obj.__parent[key]
  }

  return searchParent(obj.__parent, key)
}

export function insertMetadata (obj: any, data: object): any {
  if (Array.isArray(obj)) {
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
  if (isNamedType(type)) {
    return type.name
  }

  if (isNonNullType(type)) {
    return `Nullable${graphQLTypeName(type.ofType)}`
  }

  return `ListOf${graphQLTypeName((type as GraphQLList<any>).ofType)}`
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
