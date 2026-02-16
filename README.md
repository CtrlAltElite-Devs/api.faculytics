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

- `DATABASE_URL`: Your PostgreSQL connection string (supports Neon.tech SSL).
- `MOODLE_BASE_URL`: The base URL of your Moodle instance (e.g., `https://moodle.example.com`).
- `JWT_SECRET` & `REFRESH_SECRET`: Secure strings for token signing.
- `CORS_ORIGINS`: JSON array of allowed origins (e.g., `["http://localhost:4100"]`).

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

This project is [UNLICENSED](LICENSE)..
