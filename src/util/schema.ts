import { includes } from 'lodash'
import { astFromTypeName, AstNode, isEnclosingType } from './ast'

const ARRAYOF_REGEX = /^\[(.+)\]$/
const MAPOF_REGEX = /^map\[(.+)\]$/

export type Kind =
  'array'
  | 'boolean'
  | 'date-iso8601'
  | 'date-time-iso8601'
  | 'double'
  | 'integer'
  | 'json'
  | 'long'
  | 'map'
  | 'object'
  | 'string'
  | 'unit'
  | 'uuid'

/**
 * Given the name of a type as it appears in an API builder schema, returns
 * whether it is a representation of a map type.
 * @example
 * isMapTypeName("map[string]");
 * //=> true
 * isMapTypeName("string");
 * //=> false
 */
export function isMapTypeName (type: string) {
  return MAPOF_REGEX.test(type)
}

/**
 * Given the name of a type as it appears in an API builder schema, returns
 * whether it is a representation of an array type.
 * @example
 * isArrayTypeName("[string]");
 * //=> true
 * isArrayTypeName("string");
 * //=> false
 */
export function isArrayTypeName (type: string) {
  return ARRAYOF_REGEX.test(type)
}

/**
 * API Builder types can be complex (e.g. array of strings, map of strings,
 * maps of array of strings etc.). By design, all entries in an array or map
 * must be of the same type: this is called the base type.
 * @example
 * getBaseTypeName("map[string]")
 * //=> "string"
 * getBaseTypeName("map[[string]]")
 * //=> "string"
 */
export function getBaseTypeName (type: string | AstNode): string {
  if (typeof type === 'string') {
    return getBaseTypeName(astFromTypeName(type))
  }

  if (isEnclosingType(type)) {
    return getBaseTypeName(type.type)
  }

  return type.name
}

/**
 * Given the name of an enclosing type as it appears in an API builder schema,
 * returns the API builder type name of the underlying type.
 * @example
 * getNestedTypeName("map[string]");
 * //=> "string"
 * getNestedTypeName("map[[string]]");
 * //=> "[string]"
 */
export function getNestedTypeName (type: string): string {
  const mapType = type.match(MAPOF_REGEX)
  if (mapType) {
    return mapType[1]
  }

  const arrayType = type.match(ARRAYOF_REGEX)
  if (arrayType) {
    return arrayType[1]
  }

  return type
}

/**
 * Given the name of a type as it appears in an API builder schema, returns
 * whether its base type represents a primitive type.
 * @example
 * isPrimitiveTypeName("string");
 * //=> true
 * isPrimitiveTypeName("map[date_time_iso8601]");
 * // => true
 * isPrimitiveTypeName("[com.bryzek.spec.v0.models.reference]");
 * // => false
 */
export function isPrimitiveTypeName (type: string) {
  return includes(
    [
      'array',
      'boolean',
      'date-iso8601',
      'date-time-iso8601',
      'double',
      'integer',
      'json',
      'long',
      'map',
      'object',
      'string',
      'unit',
      'uuid'
    ],
    getBaseTypeName(type)
  )
}
