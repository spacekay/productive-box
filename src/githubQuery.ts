export default async function (query: string): Promise<any> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${process.env.GH_TOKEN}`,
    },
    body: JSON.stringify({ query }).replace(/\\n/g, ''),
  });

  const body = (await res.json()) as { errors?: unknown };

  if (!res.ok) {
    throw new Error(`GitHub GraphQL request failed (${res.status}): ${JSON.stringify(body)}`);
  }

  if (body.errors) {
    throw new Error(`GitHub GraphQL request failed: ${JSON.stringify(body.errors)}`);
  }

  return body;
}
