export interface IConfig {
  base_url: string
  models: {
    [key: string]: IModel
  }
  enums: {
    [key: string]: IEnum
  }
  unions: {
    [key: string]: IUnion
  }
  resources: {
    [key: string]: IResource
  }
}

interface IModel {
  description?: string
  fields: IField[]
  links?: {
    [name: string]: ILink
  }
}

interface IField {
  name: string
  type: string
  default: any
  required: boolean
  description?: string
}

type Source = 'context' | 'parent' | 'args'

interface ILink {
  type?: string
  params: {
    [key: string]: {
      source: Source
      type?: string
      path?: string // lodash get() syntax
    }
  }
}

interface IUnion {
  description?: string
  discriminator?: string
  types: Array<{ name: string }>
}

interface IEnum {
  description: string
  values: IEnumValue[]
}

interface IEnumValue {
  name: string
  description: string
}

interface IResource {
  one?: IGetter
  many: IGetter // TODO: optional
}

interface IGetter {
  path: string
  uid: string[][]
  params: {
    [key: string]: {
      type: string
      required: boolean
      default: any
    }
  }
}
