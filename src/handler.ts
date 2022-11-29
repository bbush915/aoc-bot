import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  ProxyResult,
} from "aws-lambda";
import { createHmac, timingSafeEqual } from "crypto";

import configuration from "./configuration";
import {
  Divisions,
  Leaderboard,
  LeaderboardService,
  ManualTiming,
  ManualTimingService,
  Participant,
  ParticipantService,
} from "./services";

const DAYS_TO_MILLISECONDS = 24 * 60 * 60 * 1000;

// NOTE - Advent of Code starts December 1st at 12 AM EST / UTC-5

const EVENT_START_TIMESTAMP = new Date(
  Number(process.env.AOC_YEAR!),
  11,
  1,
  5,
  0,
  0,
  0
).getTime();

export const register: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const slackId = params.get("user_id")!;
      const [aocId, division] = params.get("text")!.split(" ");

      if (!Object.values<string>(Divisions).includes(division)) {
        return Promise.resolve({
          statusCode: 200,
          body: "Invalid division specified. Specify either 'fun' or 'competitive'",
        });
      }

      const participantService = new ParticipantService();

      await participantService.upsert({
        slackId,
        aocId,
        division: division as Divisions,
      });

      return {
        statusCode: 200,
        body: "Registered successfully!",
      };
    } catch (error) {
      console.error(error);

      return Promise.resolve({
        statusCode: 200,
        body: "Something went wrong. Please try again later.",
      });
    }
  });

const MANUAL_START_RESPONSE_TEMPLATE = JSON.stringify({
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:clipboard: Recorded your *Day {{ day }}* start time as: *<!date^{{ timestamp }}^{date} {time_secs}|Unable to Parse Timestamp>*\n\n:runner: You can now begin: https://adventofcode.com/{{ year }}/day/{{ day }}`,
      },
    },
  ],
});

export const manualStart: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const now = new Date().getTime();

      const slackId = params.get("user_id")!;
      const day = params.get("text")! ?? calculateDay(now);

      // NOTE - Fetch the participant.

      const participantService = new ParticipantService();

      const participant = await participantService.get(slackId);

      // NOTE - Record their start time.

      const manualTimingService = new ManualTimingService();

      await manualTimingService.upsert({
        day,
        aocId: participant.aocId,
        startTimestamp: now,
      });

      // NOTE - Tell the participant to begin.

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: MANUAL_START_RESPONSE_TEMPLATE.replaceAll("{{ day }}", day)
          .replaceAll("{{ year }}", configuration.aoc.year)
          .replaceAll("{{ timestamp }}", String(Math.floor(now / 1000))),
      };
    } catch (error) {
      console.error(error);

      return Promise.resolve({
        statusCode: 200,
        body: "Something went wrong. Please try again later.",
      });
    }
  });

const LEADERBOARD_RESPONSE_TEMPLATE = JSON.stringify({
  response_type: "in_channel",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Here are the *Advent of Code* results and leaderboard for *{{ year }} Day {{ day }}*!`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Challenge",
            emoji: true,
          },
          value: "challenge",
          url: `https://adventofcode.com/{{ year }}/day/{{ day }}`,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Full Leaderboard",
            emoji: true,
          },
          value: "full_leaderboard",
          url: `https://adventofcode.com/{{ year }}/leaderboard/private/view/{{ leaderboardId }}`,
        },
      ],
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":tada:  For fun!",
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Congratulations to these participants who completed one or both parts of the challenge!",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":star: {{ funBothParts }}\n\n:star-empty: {{ funFirstPart }}",
      },
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":trophy:  For bragging rights!",
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "The overall leaderboard is determined by the total number of stars. Ties will be broken using total duration as of December 25th at 12 CST.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Daily Leaderboard*\n\n{{ competitiveDailyLeaderboard }}\n\n\n*Overall Leaderboard*\n\n{{ competitiveOverallLeaderboard }}",
      },
    },
  ],
});

export const leaderboard: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const now = new Date().getTime();

      const slackId = params.get("user_id")!;
      const day = params.get("text")! ?? calculateDay(now);

      // NOTE - Advent of Code asks that you do not request your leaderboard
      // JSON more than once per 15 minutes. To prevent accidental spam by users,
      // this command is locked down to the specified admin user ("facilitator").

      if (slackId !== configuration.slack.aocAdminId) {
        return {
          statusCode: 200,
          body: "Due to API restrictions, only your Advent of Code facilitator can use this command",
        };
      }

      // NOTE - Fetch the leaderboard.

      const leaderboardService = new LeaderboardService();
      const leaderboard = await leaderboardService.get();

      // NOTE - Fetch any manual timing for the day and create a lookup.

      const manualTimingService = new ManualTimingService();
      const manualTimings = await manualTimingService.getAllByDay(day);

      const manualTimingLookup = manualTimings.reduce(
        (lookup, manualTiming) => {
          lookup.set(manualTiming.aocId, manualTiming);
          return lookup;
        },
        new Map<string, ManualTiming>()
      );

      // NOTE - Fetch participants and create a lookup.

      const participantService = new ParticipantService();
      const participants = await participantService.getAll();

      const participantLookup = participants.reduce((lookup, participant) => {
        lookup.set(participant.aocId, participant);
        return lookup;
      }, new Map<string, Participant>());

      // NOTE - Calculate leaderboard statistics.

      const participantStatistics = calculateParticipantStatistics(
        leaderboard,
        Number(day),
        manualTimingLookup,
        participantLookup
      );

      // NOTE - Fun division.

      let funBothParts = participantStatistics
        .filter((x) => x.division === Divisions.FUN && x.dailyStars === 2)
        .sort((x, y) => {
          if (x.stars === y.stars) {
            return x.sortKey.localeCompare(y.sortKey);
          }

          return y.stars - x.stars;
        })
        .map((x) => `${x.name} (${x.stars})`)
        .join(", ");

      if (funBothParts.length === 0) {
        funBothParts = "-";
      }

      let funFirstPart = participantStatistics
        .filter((x) => x.division === Divisions.FUN && x.dailyStars === 1)
        .sort((x, y) => {
          if (x.stars === y.stars) {
            return x.sortKey.localeCompare(y.sortKey);
          }

          return y.stars - x.stars;
        })
        .map((x) => `${x.name} (${x.stars})`)
        .join(", ");

      if (funFirstPart.length === 0) {
        funFirstPart = "-";
      }

      // NOTE - Competitive division.

      let competitiveDailyLeaderboard = participantStatistics
        .filter(
          (x) => x.division === Divisions.COMPETITIVE && x.totalDuration > 0
        )
        .sort((x, y) => {
          if (x.dailyStars === y.dailyStars) {
            return x.totalDuration - y.totalDuration;
          }

          return y.dailyStars - x.dailyStars;
        })
        .map(
          (x, i) =>
            `${i + 1}. ${x.name} (${formatStar(x.dailyStars)}, ${formatTime(
              x.totalDuration
            )})`
        )
        .join("\n\n");

      if (competitiveDailyLeaderboard.length === 0) {
        competitiveDailyLeaderboard = "-";
      }

      const competitiveStarGroups = participantStatistics
        .filter((x) => x.division === Divisions.COMPETITIVE)
        .reduce<
          Record<string, ReturnType<typeof calculateParticipantStatistics>>
        >((starGroups, statistics) => {
          if (!starGroups[statistics.stars]) {
            starGroups[statistics.stars] = [];
          }

          starGroups[statistics.stars].push(statistics);
          return starGroups;
        }, {});

      let competitiveOverallLeaderboard = Object.entries(competitiveStarGroups)
        .sort(([xStars], [yStars]) => Number(yStars) - Number(xStars))
        .map(([stars, participantStatistics], i, starGroups) => {
          const rank =
            starGroups
              .slice(0, i)
              .map((x) => x[1].length)
              .reduce((sum, cur) => (sum += cur), 0) + 1;

          return `${rank}. ${participantStatistics
            .sort((x, y) => x.sortKey.localeCompare(y.sortKey))
            .map((x) => x.name)
            .join(", ")} (${stars})`;
        })
        .join("\n\n");

      if (competitiveOverallLeaderboard.length === 0) {
        competitiveOverallLeaderboard = "-";
      }

      // NOTE - Display leaderboard in Slack channel.

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: LEADERBOARD_RESPONSE_TEMPLATE.replaceAll("{{ day }}", day)
          .replaceAll("{{ year }}", configuration.aoc.year)
          .replaceAll("{{ leaderboardId }}", configuration.aoc.leaderboardId)
          .replaceAll("{{ funBothParts }}", funBothParts)
          .replaceAll("{{ funFirstPart }}", funFirstPart)
          .replaceAll(
            "{{ competitiveDailyLeaderboard }}",
            competitiveDailyLeaderboard
          )
          .replaceAll(
            "{{ competitiveOverallLeaderboard }}",
            competitiveOverallLeaderboard
          ),
      };
    } catch (error) {
      console.error(error);

      return Promise.resolve({
        statusCode: 200,
        body: "Something went wrong. Please try again later.",
      });
    }
  });

function handleSlackRequest(
  event: APIGatewayProxyEvent,
  callback: (params: URLSearchParams) => Promise<ProxyResult>
) {
  try {
    verifySlackRequest(event);

    // NOTE - Parse the Slack slash command parameters.

    const params = new URLSearchParams(
      Buffer.from(event.body!, "base64").toString("utf-8")
    );

    // NOTE - Execute the callback for the given parameters.

    return callback(params);
  } catch (error) {
    console.error(error);

    return Promise.resolve({
      statusCode: 200,
      body: "Something went wrong. Please try again later.",
    }) as ReturnType<APIGatewayProxyHandler>;
  }
}

function verifySlackRequest({ body, headers }: APIGatewayProxyEvent) {
  const timestamp = headers["x-slack-request-timestamp"];
  const signature = headers["x-slack-signature"];

  if (!timestamp || !signature) {
    throw new Error("Request is missing required headers");
  }

  if (new Date().getTime() / 1000 - Number(timestamp) > 5 * 60) {
    throw new Error("Request is stale");
  }

  const hmac = createHmac("sha256", process.env.SLACK_SIGNING_SECRET!);

  const basestring = `v0:${timestamp}:${body}`;

  hmac.update(basestring);
  const hash = hmac.digest("hex");

  if (timingSafeEqual(Buffer.from(`v0=${hash}`), Buffer.from(signature))) {
    throw new Error("Request has invalid signature");
  }
}

function calculateDay(relativeTo: number) {
  return String(
    1 + Math.floor((relativeTo - EVENT_START_TIMESTAMP) / (24 * 60 * 60 * 1000))
  );
}

function calculateParticipantStatistics(
  leaderboard: Leaderboard,
  relativeTo: number,
  manualTimingLookup: Map<string, ManualTiming>,
  participantLookup: Map<string, Participant>
) {
  return Object.values(leaderboard.members).map((member) => {
    const startTimestamp =
      EVENT_START_TIMESTAMP + (relativeTo - 1) * DAYS_TO_MILLISECONDS;

    // NOTE - If we have a manual start time, then we will use it, otherwise we
    // can calculate it relative to the event start timestamp.

    const manualTiming = manualTimingLookup.get(String(member.id));

    const adjustedStartTimestamp =
      manualTiming?.startTimestamp ?? startTimestamp;

    // NOTE - We sum up all stars up to and including the given day. For the
    // given day, we also calculate how long it took to solve each part. In
    // addition, we determine the last star timestamp to use for tiebreakers.

    let stars = 0;
    let partOneDuration = 0;
    let partTwoDuration = 0;

    for (const entry of Object.entries(member.completion_day_level)) {
      const memberDay = Number(entry[0]);
      const dailyCompletionStatistics = entry[1];

      if (memberDay > relativeTo) {
        continue;
      } else if (memberDay === relativeTo) {
        const partOneStatistics = dailyCompletionStatistics[1];

        stars++;
        partOneDuration =
          partOneStatistics.get_star_ts * 1000 - adjustedStartTimestamp;

        const partTwoStatistics = dailyCompletionStatistics[2];

        if (partTwoStatistics) {
          stars++;
          partTwoDuration =
            1000 *
            (partTwoStatistics.get_star_ts - partOneStatistics.get_star_ts);
        }
      } else {
        stars += Object.values(dailyCompletionStatistics).length;
      }
    }

    const participant = participantLookup.get(String(member.id));

    return {
      name: participant ? `<@${participant.slackId}>` : member.name,
      sortKey: member.name,
      division: participant?.division ?? Divisions.FUN,
      localScore: member.local_score,
      stars,
      dailyStars: (partOneDuration > 0 ? 1 : 0) + (partTwoDuration > 0 ? 1 : 0),
      partOneDuration,
      partTwoDuration,
      totalDuration: partOneDuration + partTwoDuration,
    };
  });
}

function formatStar(dailyStars: number) {
  return dailyStars === 2 ? ":star:" : ":star-empty:";
}

function formatTime(value: number) {
  const hours = String(Math.floor(value / (1000 * 60 * 60))).padStart(2, "0");
  const minutes = String(Math.floor(value / (1000 * 60)) % 60).padStart(2, "0");
  const seconds = String(Math.floor(value / 1000) % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}
