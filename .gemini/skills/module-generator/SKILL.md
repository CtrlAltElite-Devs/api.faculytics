---
name: module-generator
description: Scaffolds a complete NestJS module (Module, Service, Controller) and registers it in the application's module registry. Use when you need to create a new functional area in the NestJS backend.
---

# Module Generator

This skill automates the creation of a new NestJS module following the project's architectural patterns and naming conventions.

## Workflow

1.  **Identify the module name**: Use kebab-case (e.g., `user-profile`, `audit-log`).
2.  **Execute the generator script**: Use the bundled script to create the files and update the registry.
3.  **Verify the output**: Check the newly created files and the `src/modules/index.module.ts` file.
4.  **Format the code**: Run `npm run lint` or `npm run format` to ensure the new code matches the project style.

## Usage

Run the following command from the project root:

```bash
node .gemini/skills/module-generator/scripts/generate_module.cjs <module-name>
```

### Example

To create a `user-settings` module:

```bash
node .gemini/skills/module-generator/scripts/generate_module.cjs user-settings
```

This will:

- Create `src/modules/user-settings/` directory.
- Create `user-settings.service.ts`, `user-settings.controller.ts`, and `user-settings.module.ts`.
- Add `import UserSettingsModule from './user-settings/user-settings.module';` to `src/modules/index.module.ts`.
- Add `UserSettingsModule` to the `ApplicationModules` array in `src/modules/index.module.ts`.

## Standards Applied

- **File Naming**: kebab-case.
- **Class Naming**: PascalCase.
- **Module Export**: `export default class ...` as per project convention.
- **Controller/Service Export**: Named exports.
- **Directory Structure**: Modules are located under `src/modules/`.
