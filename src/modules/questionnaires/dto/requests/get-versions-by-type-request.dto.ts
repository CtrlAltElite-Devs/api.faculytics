import { IsUUID } from 'class-validator';

export class GetVersionsByTypeParam {
  @IsUUID()
  typeId!: string;
}
