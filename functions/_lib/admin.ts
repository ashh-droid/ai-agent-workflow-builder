const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
const adminSecret = process.env.NHOST_ADMIN_SECRET;

export class GraphQLError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export async function adminGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!graphqlUrl || !adminSecret) {
    throw new Error("NHOST_GRAPHQL_URL/NHOST_ADMIN_SECRET are not available to the function runtime");
  }

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string; extensions?: unknown }> };
  if (!response.ok || body.errors?.length || !body.data) {
    throw new GraphQLError(body.errors?.map((error) => error.message).join("; ") || `GraphQL request failed (${response.status})`, body.errors);
  }
  return body.data;
}

export async function updateOne<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return adminGraphql<T>(query, variables);
}
