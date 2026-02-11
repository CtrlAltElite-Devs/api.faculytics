---
name: dto-generator
description: Scaffolds NestJS DTOs with class-validator and @nestjs/swagger decorators.
---

# DTO Generator

This skill automates the creation of Data Transfer Objects (DTOs) following the project's standards for validation and documentation.

## Workflow

1.  **Identify the DTO name**: Use PascalCase (e.g., `CreateUserDto`, `UpdateProfileRequest`).
2.  **Identify the module and type**: Requests go to `dto/requests`, Responses to `dto/responses`.
3.  **Execute the generator script**: Provide the name and module.
4.  **Define properties**: The script will prompt or you can edit the file to add specific fields.

## Usage

Run the following command from the project root:

```bash
node .gemini/skills/dto-generator/scripts/generate_dto.cjs <module-name> <dto-name> <type: request|response>
```

### Example

To create a `UpdatePasswordRequest` in the `auth` module:

```bash
node .gemini/skills/dto-generator/scripts/generate_dto.cjs auth UpdatePasswordRequest request
```

This will:

- Create `src/modules/auth/dto/requests/update-password-request.dto.ts`.
- Scaffold the class with `@ApiProperty` and basic `class-validator` placeholders.

## Standards Applied

- **File Naming**: kebab-case (e.g., `update-password-request.dto.ts`).
- **Validation**: `class-validator` decorators.
- **Documentation**: `@nestjs/swagger` decorators.
