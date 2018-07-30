export interface IConfig {
  models: {
    [key: string]: IModel
  }
  enums: {
    [key: string]: IEnum
  }
  resources: {
    [key: string]: IResource
  }
}

interface IModel {
  name: string
  description: string
  fields: IField[]
}

interface IField {
  name: string
  type: string
  default: any
  required: boolean
}

interface IEnum {
  name: string
  description: string
  values: IEnumValue[]
}

interface IEnumValue {
  name: string
  description: string
}

interface IResource {
  one: IGetter
  many: IGetter
}

interface IGetter {
  path: string
  params: {
    [key: string]: {
      type: string
      required: boolean
      default: any
    }
  }
}
