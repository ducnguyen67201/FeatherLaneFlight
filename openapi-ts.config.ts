import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input:
    process.env.FLF_SCHEMA_INPUT ?? "./packages/contracts/schemas/openapi.json",
  output:
    process.env.FLF_CLIENT_OUTPUT ??
    "packages/contracts/typescript/src/generated",
  plugins: [
    "@hey-api/typescript",
    "@hey-api/client-fetch",
    {
      name: "zod",
      requests: true,
      responses: true,
      definitions: true,
      $resolvers: {
        // Fetch normalizes headers into a Headers instance before validation.
        validator: {
          request: (ctx) => [
            ctx.$.const("request").assign(
              ctx
                .$(ctx.symbols.z)
                .attr("object")
                .call(
                  ctx.$.object().prop(
                    "headers",
                    ctx.$(ctx.symbols.z).attr("instanceof").call("Headers"),
                  ),
                )
                .attr("passthrough")
                .call()
                .attr("parse")
                .call("data"),
            ),
            ctx
              .$(ctx.symbols.schema)
              .attr("parseAsync")
              .call(
                ctx.$.object()
                  .spread("request")
                  .prop(
                    "headers",
                    ctx
                      .$("Object")
                      .attr("fromEntries")
                      .call(ctx.$("request").attr("headers")),
                  ),
              )
              .await()
              .return(),
          ],
        },
        // The pinned generator otherwise strips extra keys despite the wire schema.
        object: (ctx) =>
          ctx.schema.additionalProperties &&
          ctx.schema.additionalProperties.type === "never"
            ? ctx.nodes.base(ctx).attr("strict").call()
            : undefined,
      },
    },
    { name: "@hey-api/sdk", validator: { request: "zod", response: "zod" } },
    {
      name: "@tanstack/react-query",
      queryOptions: true,
      infiniteQueryOptions: false,
    },
  ],
});
