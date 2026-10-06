export const openapiDocument = {
  openapi: "3.1.0",
  info: { title: "ERPSYS API", version: "1.0.0" },
  paths: {
    "/api/health": {
      get: {
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        responses: {
          "200": { description: "OK" },
        },
      },
    },
  },
} as const;
