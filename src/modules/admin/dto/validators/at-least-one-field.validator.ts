import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'atLeastOneField', async: false })
export class AtLeastOneField implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as Record<string, unknown>;
    const fieldNames = args.constraints as string[];
    return fieldNames.some((name) => object[name] !== undefined);
  }

  defaultMessage(args: ValidationArguments): string {
    const fieldNames = args.constraints as string[];
    return `At least one of the following fields is required: ${fieldNames.join(', ')}`;
  }
}
