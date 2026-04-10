import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isBeforeEndDate', async: false })
export class IsBeforeEndDate implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const obj = args.object as { startDate?: string; endDate?: string };
    if (!obj.startDate || !obj.endDate) return true;
    return obj.startDate < obj.endDate;
  }
  defaultMessage() {
    return 'startDate must be before endDate';
  }
}
