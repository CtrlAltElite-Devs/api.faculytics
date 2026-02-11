const fs = require('fs');
const path = require('path');

const moduleName = process.argv[2];
const dtoName = process.argv[3];
const type = process.argv[4] || 'request'; // request or response

if (!moduleName || !dtoName) {
  console.error('Usage: node generate_dto.cjs <module-name> <dto-name> [request|response]');
  process.exit(1);
}

const toKebabCase = (str) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

const fileName = toKebabCase(dtoName) + '.dto.ts';
const subDir = type === 'response' ? 'responses' : 'requests';
const targetDir = path.join(process.cwd(), 'src', 'modules', moduleName, 'dto', subDir);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const targetPath = path.join(targetDir, fileName);

if (fs.existsSync(targetPath)) {
  console.error(`DTO already exists: ${targetPath}`);
  process.exit(1);
}

const content = `import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ${dtoName} {
  @ApiProperty({
    description: 'Example property description',
    example: 'example value',
  })
  @IsString()
  @IsNotEmpty()
  exampleProperty: string;
}
`;

fs.writeFileSync(targetPath, content);
console.log(`Successfully created DTO: ${targetPath}`);
