import { GraphQLScalarType, Kind } from 'graphql'

function checkLong (value: any) {
  if (typeof value !== 'number') throw new TypeError(`${value} is not a number`)
  if (!Number.isInteger(value)) throw new TypeError(`${value} is not a long`)
  return value
}

export const GraphQLLong = new GraphQLScalarType({
  name: 'Long',
  serialize: checkLong,
  parseValue: checkLong,
  parseLiteral (ast) {
    console.log('parseLiteral', ast)
    if (ast.kind === Kind.INT) {
      return parseInt(ast.value, 10)
    }
  }
})

function checkObject (value: any) {
  if (typeof value !== 'object') throw new TypeError(`${value} is not an object`)
  if (Array.isArray(value)) throw new TypeError(`${value}: keys should be strings, got an array`)
  return value
}

export const GraphQLObject = new GraphQLScalarType({
  name: 'Object',
  description: 'JSON object',
  serialize: checkObject,
  parseValue: checkObject,
  parseLiteral (ast) {
    console.log('parseLiteral', ast) // TODO
    throw new Error('parsing not implemented')
  }
})

export const GraphQLUnit = new GraphQLScalarType({
  name: 'Unit',
  serialize: () => null,
  parseValue: () => null,
  parseLiteral (ast) {
    console.log('parseLiteral', ast)
    throw new Error('parsing not implemented')
  }
})

export { GraphQLDate, GraphQLDateTime } from 'graphql-iso-date'

import GraphQLJSON from 'graphql-type-json'
export { GraphQLJSON }
