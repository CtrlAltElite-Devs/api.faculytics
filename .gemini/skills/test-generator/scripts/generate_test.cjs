const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('Please provide a file path (e.g., src/modules/auth/auth.service.ts).');
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`File does not exist: ${absolutePath}`);
  process.exit(1);
}

const content = fs.readFileSync(absolutePath, 'utf8');

// Identify if it's a Service or Controller
const isService = content.includes('@Injectable()');
const isController = content.includes('@Controller(');

if (!isService && !isController) {
  console.error('Target file does not appear to be a NestJS Service or Controller.');
  process.exit(1);
}

// Extract Class Name
const classNameMatch = content.match(/export class (\w+)/);
const className = classNameMatch ? classNameMatch[1] : null;

if (!className) {
  console.error('Could not identify class name.');
  process.exit(1);
}

// Extract dependencies from constructor
const constructorMatch = content.match(/constructor\s*\(([^)]*)\)/s);
const dependencies = [];

if (constructorMatch) {
  const params = constructorMatch[1];
  const paramMatches = params.matchAll(/(?:private|protected|public)?\s*(?:readonly)?\s*(\w+)\s*:\s*([\w<>|]+)/g);
  for (const match of paramMatches) {
    dependencies.push({
      name: match[1],
      type: match[2].replace(/<.*>/, ''),
    });
  }
}

// Generate Spec Content
const specFilePath = absolutePath.replace(/\.ts$/, '.spec.ts');
const relativeImportPath = `./${path.basename(filePath, '.ts')}`;

let imports = [
  "import { Test, TestingModule } from '@nestjs/testing';",
  `import { ${className} } from '${relativeImportPath}';`,
];

let providers = [className];

dependencies.forEach(dep => {
  const escapedDepType = dep.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const defaultImportRegex = new RegExp(`import\\s+${escapedDepType}\\s+from\\s+['"](.*)['"]`);
  const defaultMatch = content.match(defaultImportRegex);
  
  if (defaultMatch) {
    imports.push(`import ${dep.type} from '${defaultMatch[1]}';`);
  } else {
    const namedImportRegex = new RegExp(`import\\s+{[^}]*\\b${escapedDepType}\\b[^}]*}\\s+from\\s+['"](.*)['"]`);
    const namedMatch = content.match(namedImportRegex);
    if (namedMatch) {
      imports.push(`import { ${dep.type} } from '${namedMatch[1]}';`);
    }
  }

  providers.push(`{
          provide: ${dep.type},
          useValue: {
            ${dep.type === 'UnitOfWork' ? '// eslint-disable-next-line @typescript-eslint/no-unsafe-return\n            runInTransaction: jest.fn().mockImplementation((cb: (em: any) => any) => cb({ getRepository: jest.fn() })),': '// TODO: Mock methods'}
          },
        }`);
});

imports = [...new Set(imports)];

const specContent = imports.join('\n') + '\n\n' +
`describe('${className}', () => {
  let service: ${className};
${dependencies.map(dep => `  // eslint-disable-next-line @typescript-eslint/no-unused-vars\n  let ${dep.name}: ${dep.type};`).join('\n')}

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${providers.join(',\n        ')}
      ],
    }).compile();

    service = module.get<${className}>(${className});
${dependencies.map(dep => `    ${dep.name} = module.get<${dep.type}>(${dep.type});`).join('\n')}
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
`;

fs.writeFileSync(specFilePath, specContent);
console.log(`Successfully created test file: ${specFilePath}`);
