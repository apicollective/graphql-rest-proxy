import { GraphQLEnumType, GraphQLType } from 'graphql'
import _ from 'lodash'
import { IConfig } from './util/types'

export function createEnums (types: Map<string, GraphQLType>, config: IConfig) {
  for (const [name, enm] of Object.entries(config.enums)) {
    types.set(name, new GraphQLEnumType({
      name,
      description: enm.description,
      values: _.chain(enm.values)
               .keyBy('name')
               .mapKeys((value, key) => _.snakeCase(key).toUpperCase())
               .mapValues((enumValue) => ({
                 value: enumValue.name,
                 description: enumValue.description
               }))
               .value()
    }))
  }
}
