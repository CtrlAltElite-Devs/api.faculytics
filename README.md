# Faculytics API

Faculytics is an analytics platform designed to integrate seamlessly with Moodle LMS. This repository contains the backend API built with NestJS.

## Tech Stack

- **Framework:** [NestJS](https://nestjs.com/) v11
- **ORM:** [MikroORM](https://mikro-orm.io/) with PostgreSQL
- **Validation:** [Zod](https://zod.dev/) & [class-validator](https://github.com/typestack/class-validator)
- **Authentication:** [Passport.js](http://www.passportjs.org/) (JWT + Moodle token strategies)
- **Job Queue:** [BullMQ](https://docs.bullmq.io/) on Redis
- **Caching:** Redis via `@keyv/redis`
- **Documentation:** [Swagger/OpenAPI](https://swagger.io/)

## Prerequisites

- **Node.js:** v22.x or later
- **PostgreSQL:** A running instance of PostgreSQL
- **Redis:** Required for caching and job queues
- **Moodle:** A Moodle instance with **Mobile Web Services** enabled

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
| `REDIS_URL`         | Redis connection URL (e.g., `redis://localhost:6379`)                 |
| `CORS_ORIGINS`      | JSON array of allowed origins (e.g., `["http://localhost:4100"]`)     |
| `OPENAI_API_KEY`    | OpenAI API key (for ChatKit and recommendation engine)                |

**Optional Variables:**

| Variable                               | Default       | Description                                                                                |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `PORT`                                 | `5200`        | Server port                                                                                |
| `NODE_ENV`                             | `development` | `development` \| `production` \| `test`                                                    |
| `OPENAPI_MODE`                         | `false`       | Set to `"true"` to enable Swagger docs                                                     |
| `SUPER_ADMIN_USERNAME`                 | `superadmin`  | Default super admin username (also used by the tiered scheduler for system attribution)    |
| `SUPER_ADMIN_PASSWORD`                 | `password123` | Default super admin password                                                               |
| `SYNC_ON_STARTUP`                      | `false`       | Run course and enrollment sync on startup                                                  |
| `DISABLE_SYNC_CATEGORY_ON_STARTUP`     | `false`       | Skip category sync on startup (faster dev restarts)                                        |
| `MOODLE_SYNC_CONCURRENCY`              | `3`           | Max concurrent Moodle HTTP calls during sync (1-20)                                        |
| `SENTIMENT_WORKER_URL`                 | —             | RunPod/mock worker URL for sentiment analysis                                              |
| `SENTIMENT_CHUNK_SIZE`                 | `50`          | Submissions per sentiment chunk dispatched to the worker                                   |
| `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD` | `false`       | Production safety gate — must be `true` to enable vLLM dispatch when `NODE_ENV=production` |

See `.env.sample` for the full list including BullMQ, embeddings, topic-model, and recommendation worker options.

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

### 4. Local Development with Docker

```bash
# Start Redis + mock analysis worker
docker compose up
```

This starts:

- **Redis** on port 6379 (required for caching and BullMQ job queues)
- **Mock worker** on port 3001 (simulates analysis worker responses for local dev)

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
