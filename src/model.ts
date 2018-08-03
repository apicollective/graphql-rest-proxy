import got, { GotError } from 'got'
import {
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLObjectType,
  GraphQLType,
  isInputType,
  isOutputType
} from 'graphql'
import _ from 'lodash'
import { astFromTypeName } from './util/ast'
import { insertMetadata, searchContext, toGraphQLType } from './util/helpers'
import { IConfig } from './util/types'

class ValidationError extends Error {
  private modelName?: string
  private fieldName?: string
  private linkName?: string
  private paramName?: string
  private argName?: string
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
        const type = toGraphQLType(astFromTypeName(field.type), types)

        if (type == null) {
          throw new ValidationError(`unknown type '${field.type}'`).model(modelName).field(field.name)
        }

        if (!isOutputType(type)) {
          throw new ValidationError(`${field.type} is not a GraphQLOutputType`).model(modelName).field(field.name)
        }

        res[field.name] = {
          type,
          description: field.description
        }
      }

      // links
      for (const [linkTypeName, link] of Object.entries(model.links || {})) {

        const linkType = toGraphQLType(astFromTypeName(linkTypeName), types)

        if (!linkType) {
          throw new ValidationError(`unknown type`).model(modelName).link(linkTypeName)
        }

        if (!isOutputType(linkType)) {
          throw new ValidationError(`not a GraphQLOutputType`).model(modelName).link(linkTypeName)
        }

        if (config.resources[linkTypeName] == null) {
          throw new ValidationError(`no such resource`).model(modelName).link(linkTypeName)
        }

        // convert strings to { type, source }
        const params = _.mapValues(link.params, (param) => {
          if (typeof param === 'string') {
            return {
              type: 'string',
              source: param
            }
          }
          return param
        })

        Object.entries(params).forEach(([ name, { source } ]) => {
          if (source !== 'args' && source !== 'parent' && source !== 'context') {
            throw new ValidationError(`invalid source ${source}`).model(modelName).link(linkTypeName).param(name)
          }
        })

        res[linkTypeName] = {
          type: linkType,
          args: _.chain(params)
                 .pickBy(_.matches({ source: 'args' })) // params that should be args
                 .mapValues(({ type }, name) => {
                   const argType = toGraphQLType(astFromTypeName(type), types)
                   if (argType != null && isInputType(argType)) {
                     return { type: argType } // create the arg object
                   } else {
                     throw new ValidationError(`Arg[${name}]: no such type '${type}'`)
                              .model(modelName).link(linkTypeName)
                   }
                 })
                 .value() as GraphQLFieldConfigArgumentMap,
          resolve: async (source, args, context) => {
            const resource = config.resources[linkTypeName]

            function getArg (key: string) {
              if (params[key] == null) {
                throw new Error(`don't know how to get parameter ${key} for link ${linkTypeName} on model ${modelName}`)
              }
              switch (params[key].source) {
                case 'args': {
                  return args[key]
                }
                case 'parent': {
                  const value = source[key]
                  if (value == null) {
                    throw new Error(`couldn't find [${key}] in ${JSON.stringify(source)}`)
                  }
                  return value
                }
                case 'context': {
                  const value = searchContext(source, key)
                  if (value == null) {
                    throw new Error(`couldn't find [${key}] in full context from ${JSON.stringify(source)}`)
                  }
                  return value
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
              if (params[key] != null) { // if we know how to get it
                query[key] = getArg(key)
              } else if (param.required && param.default != null) { // if required and have default
                query[key] = param.default
              } else if (param.required) { // required and not supplied
                throw new Error(`missing required param ${key}`)
              }
            }

            // const unique = _.some(resource.many.uid, (index) =>
            //   _.every(index, (field) => args[field] != null))

            // if (!unique) {
            //   throw new Error('not fetching a unique item. please fill out ' +
            //                   resource.many.uid.map((fields) => `[${fields.join(',')}]`).join(', or '))
            // }

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
