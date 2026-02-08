import z from "zod";

export const serverEnvSchema = z.object({
  PORT: z.coerce.number().default(5100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development")
})
