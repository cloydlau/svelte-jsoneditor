import type Ajv from 'ajv'
import type { Options, Schema, ErrorObject } from 'ajv'
import AjvDist from 'ajv'
import type { JSONValue } from 'immutable-json-patch'
import { parsePath } from 'immutable-json-patch'
import type { JSONSchema, JSONSchemaDefinitions, ValidationError, Validator } from '$lib/types'
import { ValidationSeverity } from '$lib/types.js'

export interface AjvValidatorOptions {
  schema: JSONSchema
  schemaDefinitions?: JSONSchemaDefinitions
  ajvOptions?: Options
  onCreateAjv?: (ajv: Ajv) => Ajv | void
}

/**
 * Create a JSON Schema validator powered by Ajv.
 * @param options
 * @property schema
 *                    The JSON schema to validate (required).
 * @property [schemaDefinitions=undefined]
 *                    An object containing JSON Schema definitions
 *                    which can be referenced using $ref
 * @property [ajvOptions=undefined]
 *                    Optional extra options for Ajv
 * @property [onCreateAjv=undefined]
 *                    An optional callback function allowing to apply additional
 *                    configuration on the provided Ajv instance, or return
 *                    your own Ajv instance and ignore the provided one.
 * @return Returns a validation function
 */
export function createAjvValidator(options: AjvValidatorOptions): Validator {
  // Deprecation error for the API of v0.9.2 and older
  if (options.schema === undefined) {
    throw new Error(
      'Deprecation warning: ' +
        'the signature of createAjvValidator is changed from ' +
        'createAjvValidator(schema, schemaDefinitions, ajvOptions) ' +
        'to ' +
        'createAjvValidator({ schema, schemaDefinitions, ajvOptions }). ' +
        'Please pass the arguments as an object instead of unnamed arguments.'
    )
  }

  let ajv = createAjvInstance(options)
  if (options.onCreateAjv !== undefined) {
    ajv = options.onCreateAjv(ajv) || ajv

    // validate whether ajv is configured correctly (this is needed to enhance error messages)
    if (ajv.opts.verbose === false) {
      throw new Error('Ajv must be configured with the option verbose=true')
    }
  }

  const validateAjv = ajv.compile(options.schema as Schema)

  return function validate(json: JSONValue): ValidationError[] {
    validateAjv(json)
    const ajvErrors = validateAjv.errors || []

    return ajvErrors.map(improveAjvError).map((error) => normalizeAjvError(json, error))
  }
}

function createAjvInstance(options: AjvValidatorOptions): Ajv {
  const { schemaDefinitions, ajvOptions } = options

  const ajv = new AjvDist({
    allErrors: true,
    verbose: true,
    $data: true,
    ...ajvOptions
  })

  if (schemaDefinitions) {
    Object.keys(schemaDefinitions).forEach((ref) => {
      ajv.addSchema(schemaDefinitions[ref] as Schema, ref)
    })
  }

  return ajv
}

function normalizeAjvError(json: JSONValue, ajvError: ErrorObject): ValidationError {
  return {
    path: parsePath(json, ajvError.instancePath),
    message: ajvError.message || 'Unknown error',
    severity: ValidationSeverity.warning
  }
}

/**
 * Improve the error message of a JSON schema error,
 * for example list the available values of an enum.
 *
 * @param {Object} ajvError
 * @return {Object} Returns the error with improved message
 */
function improveAjvError(ajvError: ErrorObject) {
  if (ajvError.keyword === 'enum' && Array.isArray(ajvError.schema)) {
    let enums = ajvError.schema
    if (enums) {
      enums = enums.map((value) => JSON.stringify(value))

      if (enums.length > 5) {
        const more = ['(' + (enums.length - 5) + ' more...)']
        enums = enums.slice(0, 5)
        enums.push(more)
      }
      ajvError.message = 'should be equal to one of: ' + enums.join(', ')
    }
  }

  if (ajvError.keyword === 'additionalProperties') {
    ajvError.message = 'should NOT have additional property: ' + ajvError.params.additionalProperty
  }

  return ajvError
}
