export const userInfoQuery = `
  query {
    viewer {
      login
      id
      createdAt
    }
  }
`;

export const createContributedRepoQuery = (username: string, from: string, to: string) => `
  query {
    user(login: "${username}") {
      contributionsCollection(from: "${from}", to: "${to}") {
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            isFork
            name
            owner {
              login
            }
          }
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
