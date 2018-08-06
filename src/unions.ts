import { GraphQLType, GraphQLUnionType, isObjectType } from 'graphql'
import { IConfig } from './util'

export function createUnions (types: Map<string, GraphQLType>, config: IConfig) {
  for (const [name, union] of Object.entries(config.unions)) {
    types.set(name, new GraphQLUnionType({
      name,
      types: () => union.types.map(({ type }) => {
        const res = types.get(type)
        if (res == null) {
          throw new Error(`Union[${name}]: unknown type ${type}`)
        }
        if (!isObjectType(res)) {
          throw new Error(`Union[${name}]: non-object type ${type} not supported in union`)
        }
        return res
      }),
      description: union.description,
      resolveType:
        union.discriminator !== undefined
        // we need the type assertion because union.discriminator will not change from string to undefined at runtime
        ? (value) => value[union.discriminator as string]
        : undefined
    }))
  }
}
