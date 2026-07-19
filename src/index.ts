import { Octokit } from '@octokit/rest';
import { config } from 'dotenv';

import generateBarChart from './generateBarChart.js';
import githubQuery from './githubQuery.js';
import { createCommittedDateQuery, createContributedRepoQuery, userInfoQuery } from './queries.js';
/**
 * get environment variable
 */
config({ path: ['.env'] });

interface IRepo {
  name: string;
  owner: string;
}

interface RepoInfo {
  name: string;
  owner: {
    login: string;
  };
  isFork: boolean;
}

interface Edge {
  node: {
    committedDate: string;
  };
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function getContributedRepos(username: string, createdAt: string): Promise<IRepo[]> {
  const repoMap = new Map<string, IRepo>();
  /**
   * `contributionsCollection` covers at most one year per query, so walk backwards
   * from now to the account creation date one year at a time and union the repos.
   * Fall back to a single last-year window if `createdAt` is missing/invalid.
   */
  const parsedCreatedAt = new Date(createdAt);
  const accountCreated = Number.isNaN(parsedCreatedAt.getTime())
    ? new Date(Date.now() - ONE_YEAR_MS)
    : parsedCreatedAt;
  let windowEnd = new Date();

  while (windowEnd > accountCreated) {
    const windowStart = new Date(Math.max(accountCreated.getTime(), windowEnd.getTime() - ONE_YEAR_MS));

    const response = await githubQuery(
      createContributedRepoQuery(username, windowStart.toISOString(), windowEnd.toISOString()),
    );
    const contributions: { repository: RepoInfo }[] =
      response?.data?.user?.contributionsCollection?.commitContributionsByRepository ?? [];

    for (const { repository } of contributions) {
      if (repository.isFork) continue;
      const key = `${repository.owner.login}/${repository.name}`;
      if (!repoMap.has(key)) {
        repoMap.set(key, { name: repository.name, owner: repository.owner.login });
      }
    }

    windowEnd = windowStart;
  }

  return [...repoMap.values()];
}

async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...(await Promise.all(items.slice(index, index + batchSize).map(mapper))));
  }

  return results;
}

(async () => {
  /**
   * First, get user id
   */
  const userResponse = await githubQuery(userInfoQuery);
  const { login: username, id, createdAt } = userResponse?.data?.viewer ?? {};

  /**
   * Second, get contributed repos
   */
  const repos = await getContributedRepos(username, createdAt);

  /**
   * Third, get commit time and parse into commit-time/hour diagram
   */
  const committedTimeResponseMap = await mapInBatches(repos, 5, ({ name, owner }) =>
    githubQuery(createCommittedDateQuery(id, name, owner)),
  );

  let morning = 0; // 6 - 12
  let daytime = 0; // 12 - 18
  let evening = 0; // 18 - 24
  let night = 0; // 0 - 6

  committedTimeResponseMap.forEach((committedTimeResponse) => {
    committedTimeResponse?.data?.repository?.defaultBranchRef?.target?.history?.edges.forEach((edge: Edge) => {
      const committedDate = edge?.node?.committedDate;
      const timeString = new Date(committedDate).toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: process.env.TIMEZONE,
      });
      const hour = +timeString.split(':')[0];

      /**
       * voting and counting
       */
      if (hour >= 6 && hour < 12) morning++;
      if (hour >= 12 && hour < 18) daytime++;
      if (hour >= 18 && hour < 24) evening++;
      if (hour >= 0 && hour < 6) night++;
    });
  });

  /**
   * Next, generate diagram
   */
  const sum = morning + daytime + evening + night;
  if (!sum) return;

  const oneDay = [
    { label: '🌞 Morning', commits: morning },
    { label: '🌆 Daytime', commits: daytime },
    { label: '🌃 Evening', commits: evening },
    { label: '🌙 Night', commits: night },
  ];

  const lines = oneDay.reduce((prev, cur) => {
    const percent = (cur.commits / sum) * 100;
    const line = [
      `${cur.label}`.padEnd(10),
      `${cur.commits.toString().padStart(5)} commits`.padEnd(14),
      generateBarChart(percent, 21),
      String(percent.toFixed(1)).padStart(5) + '%',
    ];

    return [...prev, line.join(' ')];
  }, [] as string[]);

  /**
   * Finally, write into gist
   */
  const octokit = new Octokit({ auth: `token ${process.env.GH_TOKEN}` });
  const gist = await octokit.gists
    .get({
      gist_id: `${process.env.GIST_ID}`,
    })
    .catch((error) => console.error(`Unable to update gist\n${error}`));
  if (!gist) return;

  if (!gist.data.files) {
    console.error('No file found in the gist');
    return;
  }

  const filename = Object.keys(gist.data.files)[0];
  await octokit.gists.update({
    gist_id: `${process.env.GIST_ID}`,
    files: {
      [filename]: {
        filename: morning + daytime > evening + night ? "I'm an early 🐤" : "I'm a night 🦉",
        content: lines.join('\n'),
      },
    },
  });

  console.log('Success to update the gist 🎉');
})().catch((error) => {
  console.error(`Unable to update productive box: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
