import {
  getNestedTypeName,
  isArrayTypeName,
  isMapTypeName,
  Kind
} from './schema'

export type AstNode = IBaseType | Enclosing
export type Enclosing = IArray | IMap

export interface IBaseType {
  name: Exclude<Kind, 'array' | 'map'>
}

export interface IArray {
  name: 'array'
  type: AstNode
}

export interface IMap {
  name: 'map'
  type: AstNode
}

export function isEnclosingType (node: AstNode): node is Enclosing {
  return node.name === 'array' || node.name === 'map'
}

/**
 * Produces an AST given the name of a type as it appears in an API builder schema.
 * Useful to construct concrete types from strings.
 * @example
 * astFromTypeName("string")
 * // => { name: "string" }
 * astFromTypeName("map[[string]]");
 * //=> { name: "map", type: { name: "array", type: { name: "string" } } }
 */
export function astFromTypeName (typeName: string): AstNode {
  switch (true) {
    case isMapTypeName(typeName):
      return {
        name: 'map',
        type: astFromTypeName(getNestedTypeName(typeName))
      }
    case isArrayTypeName(typeName):
      return {
        name: 'array',
        type: astFromTypeName(getNestedTypeName(typeName))
      }
    default:
      return { name: typeName } as IBaseType
  }
}

/**
 * Returns the type name for the specified API builder AST.
 * @example
 * typeNameFromAst({ name: "map", type: { name: "string" } });
 * //=> "map[string]"
 */
export function typeNameFromAst (ast: AstNode): string {
  switch (ast.name) {
    case 'map':
      return `map[${typeNameFromAst(ast.type)}]`
    case 'array':
      return `[${typeNameFromAst(ast.type)}]`
    default:
      return ast.name
  }
}
