import { env, envPortResolve } from "../env";

function exposeApiDocumentationInLogs() {
  if (env.NODE_ENV !== "development") return;
  const port = envPortResolve();
  console.log(`📚 Swagger API docs available at: http://localhost:${port}/swagger`);
  console.log(`🔖 Scalar API docs available at: http://localhost:${port}/docs`);
}

export const usePostBootstrap = () => {
  exposeApiDocumentationInLogs();
};
