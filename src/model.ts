import assert from 'assert'
import got, { GotError } from 'got'
import {
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLType,
  isInputType,
  isOutputType
} from 'graphql'
import jsonpath from 'jsonpath'
import _ from 'lodash'
import { astFromTypeName, AstNode, isEnclosingType } from './util/ast'
import { insertMetadata, searchArgs, toGraphQLType } from './util/helpers'
import { IConfig } from './util/types'

class ValidationError extends Error {
  private modelName?: string
  private fieldName?: string
  private linkName?: string
  private paramName?: string
  private msg: string

  constructor (message: string) {
    super()
    this.msg = message
  }

  public model (name: string) {
    this.modelName = name
    return this
  }

  public field (name: string) {
    this.fieldName = name
    return this
  }

  public link (name: string) {
    this.linkName = name
    return this
  }

  public param (name: string) {
    this.paramName = name
    return this
  }

  get message () {
    let res = ''

    if (this.modelName) {
      res += `Model[${this.modelName}]: `
    }
    if (this.fieldName) {
      res += `Field[${this.fieldName}]: `
    }
    if (this.linkName) {
      res += `Link[${this.linkName}]: `
    }
    if (this.paramName) {
      res += `Param[${this.paramName}]: `
    }

    res += this.msg

    return res
  }
}

function createModel (types: Map<string, GraphQLType>, modelName: string, config: IConfig): GraphQLObjectType {
  const model = config.models[modelName]

  return new GraphQLObjectType({
    name: modelName,
    description: model.description,
    fields: () => {

      const res: GraphQLFieldConfigMap<any, any> = {}

      // plain old fields
      for (const field of model.fields) {
        const typeAst = astFromTypeName(field.type)
        const type = toGraphQLType(typeAst, types)

        if (type == null) {
          throw new ValidationError(`unknown type '${field.type}'`).model(modelName).field(field.name)
        }

        if (!isOutputType(type)) {
          throw new ValidationError(`${field.type} is not a GraphQLOutputType`).model(modelName).field(field.name)
        }

        // find any maps in the current type
        let containsMap = false
        let currAst = typeAst
        while (isEnclosingType(currAst)) {
          if (currAst.name === 'map') {
            containsMap = true
            break
          }
          currAst = currAst.type
        }

        let resolve: GraphQLFieldResolver<any, any> | undefined

        // convert JSON objects to maps [{ key, value }]
        if (containsMap) {
          resolve = (source) => {
            const raw = source[field.name]

            function transformMap (obj: object, ast: AstNode): object {
              if (ast.name === 'map') {
                return Object.entries(obj)
                  .filter(([ key ]) => key !== '__args' && key !== '__parent')
                  .map(([ key, value ]) => ({
                    key,
                    value: transformMap(value, ast.type)
                  }))
              } else if (ast.name === 'array') {
                // TODO: test
                assert(Array.isArray(obj))
                return (obj as object[]).map((elem) => transformMap(elem, ast.type))
              } else {
                return obj
              }
            }

            return transformMap(raw, typeAst)
          }
        }

        res[field.name] = {
          type,
          description: field.description,
          resolve
        }
      }

      // links
      for (const link of model.links || []) {

        const linkName = link.name || link.type
        const linkType = toGraphQLType(astFromTypeName(link.type), types)

        if (!linkType) {
          throw new ValidationError(`unknown type ${link.type}`).model(modelName).link(linkName)
        }

        if (!isOutputType(linkType)) {
          throw new ValidationError(`${link.type} is not a GraphQLOutputType`).model(modelName).link(linkName)
        }

        if (config.resources[link.type] == null) {
          throw new ValidationError(`no such resource`).model(modelName).link(linkName)
        }

        // convert strings to { type, source }
        const params = link.params.map((param) => ({
          name: param.name,
          location: param.location,
          inherit: param.inherit || false,
          type: param.type || 'string',
          expression: param.expression || `$['${param.name}']`
        }))

        for (const { name, location } of params) {
          if (location !== 'instance' && location !== 'args') {
            throw new ValidationError(`invalid location ${location}`).model(modelName).link(linkName).param(name)
          }
        }

        res[linkName] = {
          type: linkType,
          args: _.chain(params)
                 .filter({ location: 'args', inherit: false })
                 .keyBy('name')
                 .mapValues(({ type }, name) => {
                   const argType = toGraphQLType(astFromTypeName(type), types)
                   if (argType != null && isInputType(argType)) {
                     return { type: argType } // create the arg object
                   } else {
                     throw new ValidationError(`Arg[${name}]: no such type '${type}'`)
                              .model(modelName).link(linkName)
                   }
                 })
                 .value() as GraphQLFieldConfigArgumentMap,
          resolve: async (source, args, context) => {
            const resource = config.resources[link.type]

            function getArg (key: string) {
              const param = params.find(({ name }) => name === key)
              if (param == null) {
                throw new Error(`don't know how to get parameter ${key} for link ${linkName} on model ${modelName}`)
              }
              switch (param.location) {
                case 'args': {
                  if (param.inherit) {
                    const value = searchArgs(source, key)
                    if (value == null) {
                      throw new Error(`couldn't find [${key}] in any args in ${JSON.stringify(source)}`)
                    }
                    return value
                  } else {
                    const value = args[key]
                    if (value == null) {
                      throw new Error(`couldn't find arg ${key}`)
                    }
                    return value
                  }
                }
                case 'instance': {
                  let values: any[]
                  if (param.inherit) {
                    // ???
                    throw new Error(`not implemented yet`)
                  } else {
                    values = jsonpath.query(source, param.expression)
                  }
                  if (values.length === 0) {
                    throw new Error(`Model[${modelName}]: Link[${linkName}]: expression[${param.expression}] ` +
                                    `returned nothing from the instance ${JSON.stringify(source)}`)
                  }
                  if (values.length > 1) {
                    throw new Error(`Model[${modelName}]: Link[${linkName}]: expression[${param.expression}] ` +
                                    `returned more than one result from the instance ${JSON.stringify(source)}`)
                  }
                  return values[0]
                }
              }
            }

            const parts = resource.many.path.split('/')
            const filled = parts.map((part) => {
              if (part[0] === ':') {
                return getArg(part.substring(1))
              } else {
                return part
              }
            }).join('/')

            const query: {[key: string]: any} = {}

            for (const [key, param] of Object.entries(resource.many.params)) {
              if (params.find(({ name }) => name === key) != null) { // if we know how to get it
                query[key] = getArg(key)
              } else if (param.required && param.default != null) { // if required and have default
                query[key] = param.default
              } else if (param.required) { // required and not supplied
                throw new Error(`Model[${modelName}]: Link[${linkName}]: missing required param ${key}`)
              }
            }

            // tslint:disable-next-line:max-line-length
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
      }

      return res

    }
  })
}

export function createModels (types: Map<string, GraphQLType>, config: IConfig) {
  for (const name of Object.keys(config.models)) {
    types.set(name, createModel(types, name, config))
  }
}
