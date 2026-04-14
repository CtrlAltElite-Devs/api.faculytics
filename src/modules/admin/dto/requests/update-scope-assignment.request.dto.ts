import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Validate, ValidateIf } from 'class-validator';
import { AtLeastOneField } from '../validators/at-least-one-field.validator';

export class UpdateScopeAssignmentDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Target department UUID, or null to reset to auto-derived',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  departmentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Target program UUID, or null to reset to auto-derived',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  programId?: string | null;

  // Synthetic field that carries the class-level "at least one of N" constraint.
  // class-validator's @Validate is a PropertyDecorator, so we attach the constraint
  // to a never-set property whose validator inspects the parent object.
  // @ApiHideProperty prevents the Swagger CLI plugin from reflecting this
  // `never`-typed property, which otherwise triggers a circular-dependency error
  // in SchemaObjectFactory when /swagger is accessed.
  @ApiHideProperty()
  @Validate(AtLeastOneField, ['departmentId', 'programId'])
  readonly _atLeastOneField?: never;
}
