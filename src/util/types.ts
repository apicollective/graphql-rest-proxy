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
    [type: string]: ILink
  }
}

interface IField {
  name: string
  type: string
  default: any
  required: boolean
  description?: string
}

interface IUnion {
  description?: string
  discriminator?: string
  types: Array<{ type: string }>
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

type Source = 'context' | 'parent' | 'args'

interface ILink {
  params: {
    [key: string]:
    | Source
    | {
      type: string
      source: Source
    }
  }
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
