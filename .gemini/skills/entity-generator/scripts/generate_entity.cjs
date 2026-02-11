const fs = require('fs');
const path = require('path');

const entityName = process.argv[2];

if (!entityName) {
  console.error('Please provide an entity name (kebab-case).');
  process.exit(1);
}

const toPascalCase = (str) => {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

const pascalName = toPascalCase(entityName);
const entityFile = `${entityName}.entity.ts`;
const repoFile = `${entityName}.repository.ts`;

const entityPath = path.join(process.cwd(), 'src', 'entities', entityFile);
const repoPath = path.join(process.cwd(), 'src', 'repositories', repoFile);

if (fs.existsSync(entityPath)) {
  console.error(`Entity already exists: ${entityPath}`);
  process.exit(1);
}

// 1. Create Repository
const repoContent = `import { EntityRepository } from '@mikro-orm/postgresql';
import { ${pascalName} } from '../entities/${entityName}.entity';

export class ${pascalName}Repository extends EntityRepository<${pascalName}> {
  // Custom repository methods
}
`;
fs.writeFileSync(repoPath, repoContent);

// 2. Create Entity
const entityContent = `import { Entity, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { ${pascalName}Repository } from '../repositories/${entityName}.repository';

@Entity({ repository: () => ${pascalName}Repository })
export class ${pascalName} extends CustomBaseEntity {
  @Property()
  name: string;
}
`;
fs.writeFileSync(entityPath, entityContent);

// 3. Update src/entities/index.entity.ts
const indexEntityPath = path.join(
  process.cwd(),
  'src',
  'entities',
  'index.entity.ts',
);
if (fs.existsSync(indexEntityPath)) {
  let content = fs.readFileSync(indexEntityPath, 'utf8');

  // Add import
  const importLine = `import { ${pascalName} } from './${entityName}.entity';\n`;
  const lastImportIndex = content.lastIndexOf('import');
  const endOfLastImport = content.indexOf('\n', lastImportIndex) + 1;
  content =
    content.slice(0, endOfLastImport) +
    importLine +
    content.slice(endOfLastImport);

  // Add to export { ... }
  const exportRegex = /export \{ (.*?) \};/;
  const exportMatch = content.match(exportRegex);
  if (exportMatch) {
    const exportedEntities = exportMatch[1].trim();
    const updatedExportedEntities = exportedEntities
      ? `${exportedEntities}, ${pascalName}`
      : pascalName;
    content = content.replace(
      exportRegex,
      `export { ${updatedExportedEntities} };`,
    );
  }

  // Add to entities array
  const entitiesArrayRegex = /export const entities = \[(.*?)\];/s;
  const arrayMatch = content.match(entitiesArrayRegex);
  if (arrayMatch) {
    const arrayContent = arrayMatch[1].trim();
    const updatedArrayContent = arrayContent
      ? `${arrayContent}, ${pascalName}`
      : pascalName;
    content = content.replace(
      entitiesArrayRegex,
      `export const entities = [${updatedArrayContent}];`,
    );
  }

  fs.writeFileSync(indexEntityPath, content);
  console.log(
    `Successfully created entity ${pascalName} and updated index.entity.ts`,
  );
} else {
  console.log(
    `Successfully created entity ${pascalName}, but index.entity.ts was not found.`,
  );
}
