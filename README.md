# Faculytics API

Faculytics is an analytics platform designed to integrate seamlessly with Moodle. This repository contains the backend API built with NestJS.

## Tech Stack

- **Framework:** [NestJS](https://nestjs.com/)
- **ORM:** [MikroORM](https://mikro-orm.io/) with PostgreSQL
- **Validation:** [Zod](https://zod.dev/) & [class-validator](https://github.com/typestack/class-validator)
- **Caching:** [Redis](https://redis.io/) (optional, falls back to in-memory)
- **Documentation:** [Swagger/OpenAPI](https://swagger.io/)

## Prerequisites

- **Node.js:** v22.x or later
- **PostgreSQL:** A running instance of PostgreSQL
- **Moodle:** A Moodle instance with **Mobile Web Services** enabled.
- **Redis (optional):** A Redis instance for distributed caching

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

| Variable               | Default       | Description                                           |
| ---------------------- | ------------- | ----------------------------------------------------- |
| `PORT`                 | `5200`        | Server port                                           |
| `NODE_ENV`             | `development` | `development` \| `production` \| `test`               |
| `OPENAPI_MODE`         | `false`       | Set to `"true"` to enable Swagger docs                |
| `SUPER_ADMIN_USERNAME` | `superadmin`  | Default super admin username                          |
| `SUPER_ADMIN_PASSWORD` | `password123` | Default super admin password                          |
| `REDIS_URL`            | —             | Redis connection URL (e.g., `redis://localhost:6379`) |
| `REDIS_KEY_PREFIX`     | `faculytics:` | Key namespace prefix                                  |
| `REDIS_CACHE_TTL`      | `60`          | Default cache TTL in seconds                          |

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

### 4. Redis Setup (Optional)

The API supports an optional Redis caching layer. Without Redis, the app uses an in-memory cache automatically.

**Option A: Local Redis with Docker**

```bash
# Start a Redis container
docker run -d --name faculytics-redis -p 6379:6379 redis:7-alpine

# Verify it's running
docker exec faculytics-redis redis-cli ping
# Should return: PONG
```

Then add to your `.env`:

```
REDIS_URL=redis://localhost:6379
```

**Option B: Redis Cloud**

1. Create a free database at [Redis Cloud](https://redis.io/cloud/)
2. Copy the connection URL from the dashboard
3. Add to your `.env`:

```
REDIS_URL=redis://default:<password>@<host>:<port>
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
