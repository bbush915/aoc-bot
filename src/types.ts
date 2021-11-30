export type Leaderboard = {
  members: Record<string, MemberStatistics>;
  event: string;
  owner_id: string;
};

type MemberStatistics = {
  id: string;
  local_score: number;
  stars: number;
  last_star_ts: number | string;
  name: string;
  global_score: number;
  completion_day_level: Record<string, DailyCompletionStatistics>;
};

type DailyCompletionStatistics = {
  "1": { get_star_ts: number };
  "2"?: { get_star_ts: number };
};

export type ManualTiming = {
  member_id: string;
  start_ts: number;
};
