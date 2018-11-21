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
  links?: ILink[]
}

interface IField {
  name: string
  type: string
  default: any
  required: boolean
  description?: string
}

interface ILink {
  name?: string
  type: string
  params: IParam[]
}

export type Location = 'instance' | 'args'

interface IParam {
  name: string
  location: Location
  inherit?: boolean
  type?: string
  expression?: string
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
  params?: {
    [key: string]: {
      type: string
      required: boolean
      default: any
    }
  }
}
