export const userInfoQuery = `
  query {
    viewer {
      login
      id
    }
  }
`;

export const createContributedRepoQuery = (username: string, cursor?: string) => `
  query {
    user(login: "${username}") {
      repositoriesContributedTo(
        first: 25
        after: ${cursor ? JSON.stringify(cursor) : null}
        includeUserRepositories: true
        contributionTypes: [COMMIT]
      ) {
        nodes {
          isFork
          name
          owner {
            login
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

export const createCommittedDateQuery = (id: string, name: string, owner: string) => `
  query {
    repository(owner: "${owner}", name: "${name}") {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 100, author: { id: "${id}" }) {
              edges {
                node {
                  committedDate
                }
              }
            }
          }
        }
      }
    }
  }
`;
