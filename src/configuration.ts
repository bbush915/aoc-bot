const configuration = {
  aoc: {
    leaderboardId: process.env.AOC_LEADERBOARD_ID!,
    session: process.env.AOC_SESSION_COOKIE!,
    year: process.env.AOC_YEAR!,
  },
  slack: {
    aocAdminId: process.env.SLACK_AOC_ADMIN_ID!,
    appId: process.env.SLACK_APP_ID!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    token: process.env.SLACK_TOKEN!,
  },
};

export default configuration;
