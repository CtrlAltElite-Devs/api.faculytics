import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsValidAnswersConstraint implements ValidatorConstraintInterface {
  private static readonly MAX_ANSWERS_COUNT = 1000;
  private static readonly MAX_JSON_SIZE_BYTES = 100 * 1024; // 100KB

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(answers: unknown, _args: ValidationArguments): boolean {
    // Must be an object
    if (
      typeof answers !== 'object' ||
      answers === null ||
      Array.isArray(answers)
    ) {
      return false;
    }

    const answersObj = answers as Record<string, unknown>;

    // Must have at least one answer
    const entries = Object.keys(answersObj);
    if (entries.length === 0) {
      return false;
    }

    // Prevent DoS: limit number of answers
    if (entries.length > IsValidAnswersConstraint.MAX_ANSWERS_COUNT) {
      return false;
    }

    // All keys must be non-empty strings, all values must be numbers
    for (const [key, value] of Object.entries(answersObj)) {
      if (typeof key !== 'string' || key.trim().length === 0) {
        return false;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return false;
      }
      // Prevent prototype pollution attempts
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return false;
      }
    }

    // Prevent DoS: limit total JSON size
    const jsonSize = JSON.stringify(answersObj).length;
    if (jsonSize > IsValidAnswersConstraint.MAX_JSON_SIZE_BYTES) {
      return false;
    }

    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultMessage(_args: ValidationArguments): string {
    return 'Answers must be a non-empty object with string keys and numeric values, containing at most 1000 entries and 100KB total size';
  }
}

export function IsValidAnswers(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidAnswersConstraint,
    });
  };
}
