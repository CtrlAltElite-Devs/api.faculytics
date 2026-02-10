const fs = require('fs');
const path = require('path');

const moduleName = process.argv[2];

if (!moduleName) {
  console.error('Please provide a module name (kebab-case).');
  process.exit(1);
}

const toPascalCase = (str) => {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

const toCamelCase = (str) => {
  return str
    .split('-')
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
};

const pascalName = toPascalCase(moduleName);
const camelName = toCamelCase(moduleName);
const moduleDir = path.join(process.cwd(), 'src', 'modules', moduleName);

if (fs.existsSync(moduleDir)) {
  console.error(`Module directory already exists: ${moduleDir}`);
  process.exit(1);
}

fs.mkdirSync(moduleDir, { recursive: true });

// 1. Create Service
const servicePath = path.join(moduleDir, `${moduleName}.service.ts`);
const serviceContent = `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${pascalName}Service {
  constructor() {}
}
`;
fs.writeFileSync(servicePath, serviceContent);

// 2. Create Controller
const controllerPath = path.join(moduleDir, `${moduleName}.controller.ts`);
const controllerContent = `import { Controller } from '@nestjs/common';
import { ${pascalName}Service } from './${moduleName}.service';

@Controller('${moduleName}')
export class ${pascalName}Controller {
  constructor(private readonly ${camelName}Service: ${pascalName}Service) {}
}
`;
fs.writeFileSync(controllerPath, controllerContent);

// 3. Create Module
const modulePath = path.join(moduleDir, `${moduleName}.module.ts`);
const moduleContent = `import { Module } from '@nestjs/common';
import { ${pascalName}Controller } from './${moduleName}.controller';
import { ${pascalName}Service } from './${moduleName}.service';

@Module({
  controllers: [${pascalName}Controller],
  providers: [${pascalName}Service],
  exports: [${pascalName}Service],
})
export default class ${pascalName}Module {}
`;
fs.writeFileSync(modulePath, moduleContent);

// 4. Update src/modules/index.module.ts
const indexModulePath = path.join(process.cwd(), 'src', 'modules', 'index.module.ts');
if (fs.existsSync(indexModulePath)) {
  let content = fs.readFileSync(indexModulePath, 'utf8');

  // Add import
  const importLine = `import ${pascalName}Module from './${moduleName}/${moduleName}.module';\n`;
  const lastImportIndex = content.lastIndexOf('import');
  const endOfLastImport = content.indexOf('\n', lastImportIndex) + 1;
  content =
    content.slice(0, endOfLastImport) +
    importLine +
    content.slice(endOfLastImport);

  // Add to ApplicationModules
  const appModulesRegex = /export const ApplicationModules = \[(.*?)\];/s;
  const match = content.match(appModulesRegex);
  if (match) {
    const modulesList = match[1].trim();
    const updatedModulesList = modulesList ? `${modulesList}, ${pascalName}Module` : pascalName;
    content = content.replace(appModulesRegex, `export const ApplicationModules = [${updatedModulesList}];`);
  }

  fs.writeFileSync(indexModulePath, content);
  console.log(`Successfully created module ${moduleName} and updated index.module.ts`);
} else {
  console.log(`Successfully created module ${moduleName}, but index.module.ts was not found to be updated.`);
}
