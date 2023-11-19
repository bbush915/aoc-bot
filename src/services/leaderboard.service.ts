import axios from "axios";

import configuration from "../configuration";

export type Leaderboard = {
  members: Record<string, MemberStatistics>;
  event: string;
  owner_id: number;
};

type MemberStatistics = {
  id: number;
  local_score: number;
  stars: number;
  last_star_ts: number | string;
  name: string;
  global_score: number;
  completion_day_level: Record<string, DailyCompletionStatistics>;
};

type DailyCompletionStatistics = {
  "1": { get_star_ts: number; star_index: number };
  "2"?: { get_star_ts: number; star_index: number };
};

export class LeaderboardService {
  async get() {
    const { leaderboardId, session, year } = configuration.aoc;

    const response = await axios.get(
      `https://adventofcode.com/${year}/leaderboard/private/view/${leaderboardId}.json`,
      {
        headers: {
          Cookie: `session=${session};`,
          "User-Agent":
            "https://github.com/bbush915/aoc-bot by bryan@dialexa.com",
        },
      }
    );

    const leaderboard: Leaderboard = response.data;

    return leaderboard;
  }
}
