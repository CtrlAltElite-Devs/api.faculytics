# Faculytics API

Faculytics is an analytics platform designed to integrate seamlessly with Moodle. This repository contains the backend API built with NestJS.

## Tech Stack

- **Framework:** [NestJS](https://nestjs.com/)
- **ORM:** [MikroORM](https://mikro-orm.io/) with PostgreSQL
- **Validation:** [Zod](https://zod.dev/) & [class-validator](https://github.com/typestack/class-validator)
- **Documentation:** [Swagger/OpenAPI](https://swagger.io/)

## Prerequisites

- **Node.js:** v22.x or later
- **PostgreSQL:** A running instance of PostgreSQL
- **Moodle:** A Moodle instance with **Mobile Web Services** enabled.

## Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Copy the sample environment file and update the variables:

```bash
cp .env.sample .env
```

**Required Variables:**

| Variable            | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (supports Neon.tech SSL)                 |
| `MOODLE_BASE_URL`   | Base URL of your Moodle instance (e.g., `https://moodle.example.com`) |
| `MOODLE_MASTER_KEY` | Moodle web services master key                                        |
| `JWT_SECRET`        | Secret for signing access tokens                                      |
| `REFRESH_SECRET`    | Secret for signing refresh tokens                                     |
| `CORS_ORIGINS`      | JSON array of allowed origins (e.g., `["http://localhost:4100"]`)     |
| `OPENAI_API_KEY`    | OpenAI API key (for ChatKit module)                                   |

**Optional Variables:**

| Variable               | Default       | Description                             |
| ---------------------- | ------------- | --------------------------------------- |
| `PORT`                 | `5200`        | Server port                             |
| `NODE_ENV`             | `development` | `development` \| `production` \| `test` |
| `OPENAPI_MODE`         | `false`       | Set to `"true"` to enable Swagger docs  |
| `SUPER_ADMIN_USERNAME` | `superadmin`  | Default super admin username            |
| `SUPER_ADMIN_PASSWORD` | `password123` | Default super admin password            |

### 3. Database Initialization

This project uses MikroORM migrations. By default, **migrations are automatically applied** when the application starts.

To manage migrations manually:

```bash
# Create a new migration
npx mikro-orm migration:create

# Apply pending migrations
npx mikro-orm migration:up

# Check migration status
npx mikro-orm migration:list
```

## Running the Project

```bash
# Development (with watch mode)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## API Documentation

Once the application is running, you can access the interactive Swagger documentation at:
`http://localhost:5200/swagger`

## Development Workflow

- **Linting:** `npm run lint`
- **Formatting:** `npm run format`
- **Husky:** Pre-commit hooks are enabled to ensure code quality (Linting + Formatting).

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## License

This project is [UNLICENSED](LICENSE).
