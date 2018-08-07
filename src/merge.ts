import { matchesProperty, mergeWith } from 'lodash'
import { IConfig } from './util'

function customizer (objValue: any, srcValue: any) {
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    return mergeByKey(objValue, srcValue, 'name')
  }
}

function mergeByKey<T extends object, K extends keyof T> (obj: T[], src: T[], key: K) {
  src.forEach((elem) => {
    const id = elem[key]
    let index = obj.findIndex(matchesProperty(key, id))
    if (index === -1) {
      obj.push(elem)
    } else {
      const newElem = mergeWith(obj[index], elem, customizer)
      index = obj.findIndex(matchesProperty(key, id))
      obj[index] = newElem
    }
  })
  return obj
}

export function mergeConfigs (config: IConfig, overlay: object): IConfig {
  return mergeWith(config, overlay, customizer)
}
