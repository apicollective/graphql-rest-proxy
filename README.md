# graphql-rest-proxy

[![Build Status](https://travis-ci.org/apicollective/graphql-rest-proxy.svg?branch=master)](https://travis-ci.org/apicollective/graphql-rest-proxy)

`graphql-rest-proxy` is a GraphQL server that proxies all requests to a REST API, and handles the translation of data. It reads a number of [configuration files](config.json), and constructs a schema and object graph.

## Configuration
The configuration format is similar to [APIBuilder](https://app.apibuilder.io/doc/apiJson).

Define your base_url:
```json
"base_url": "https://swapi.co/api",
```

Define your models:
```json
"models": {
  "people": {
    "description": "a person in the star wars universe",
    "fields": [
      { "name": "gender", "type": "string", "description": "male, female, unknown, or n/a" },
      ...
    ]
  }
},
```

Define your resources:
```json
"resources": {
  "people": {
    "many": {
      "path": "/people",
      "extract": "$.results",
      "params": {
        "search": { "type": "string", "required": false },
        "page": { "type": "integer", "required": false, "default": 1 }
      }
    }
  }
}
```

### Valid Types
| Type string       | GraphQL Type                                               |
| ----------------- | ---------------------------------------------------------- |
| boolean           | Boolean                                                    |
| date              | [Date](https://www.npmjs.com/package/graphql-iso-date)     |
| date-time-iso8601 | [DateTime](https://www.npmjs.com/package/graphql-iso-date) |
| double            | Float                                                      |
| integer           | Int                                                        |
| json              | [JSON](https://www.npmjs.com/package/graphql-type-json)    |
| long              | [Long](src/util/scalars.ts#L9)                             |
| string            | String                                                     |
| object            | [Object](src/util/scalars.ts#L27)                          |
| unit              | [Unit](src/util/scalars.ts#L38)                            |
| uuid              | ID                                                         |

## Authentication
The only currently supported method of API authentication is by proxying the `Authorization` HTTP header from the GraphQL server to the REST backend. This is automatically done on every request.

## Resources and Parameters
TODO

## Links
TODO
