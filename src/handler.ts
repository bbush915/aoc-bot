import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  ProxyResult,
} from "aws-lambda";
import { WebClient as SlackClient } from "@slack/web-api";
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

export const initiateRegistration: APIGatewayProxyHandler = async (event) =>
  await handleSlackRequest(event, async (params) => {
    const slackId = params.get("user_id")!;
    const triggerId = params.get("trigger_id")!;

    const participantService = new ParticipantService();

    await participantService.openRegistrationModal(triggerId, slackId);

    return {
      statusCode: 200,
      body: "",
    };
  });

export const handleInteraction: APIGatewayProxyHandler = async (event) =>
  await handleSlackRequest(event, async (params) => {
    const payload = JSON.parse(params.get("payload")!);

    switch (payload.type) {
      case "message_action": {
        switch (payload.callback_id) {
          case "refresh-leaderboard": {
            const user = payload.user;

            if (user.id !== configuration.slack.aocAdminId) {
              return {
                statusCode: 200,
                body: "Due to API restrictions, only your Advent of Code facilitator can perform this action",
              };
            }

            // NOTE - Grab day number from mesage.

            const day =
              payload.message.blocks[0].text.text.match(/Day (\d+)/)[1];

            // NOTE - Update leaderboard.

            const slackClient = new SlackClient(configuration.slack.token);

            const blocks = await getLeaderboardBlocks(day);

            await slackClient.chat.update({
              ts: payload.message_ts,
              channel: payload.channel.id,
              blocks,
            });

            break;
          }

          default: {
            throw new Error(`Unhandled callback: ${payload.callback_id}`);
          }
        }

        break;
      }

      case "view_submission": {
        const view = payload.view;
        const meta = JSON.parse(view.private_metadata);

        switch (meta.type) {
          case "REGISTRATION": {
            const { slackId } = meta.data;

            const {
              aoc_id_block: {
                aoc_id: { value: aocId },
              },
              division_block: {
                division: {
                  selected_option: { value: division },
                },
              },
              ai_usage_type_block: {
                ai_usage_type: {
                  selected_option: { value: aiUsageType },
                },
              },
            } = view.state.values;

            var participantService = new ParticipantService();

            await participantService.upsert({
              slackId,
              aocId,
              division,
              aiUsageType,
            });

            break;
          }

          default: {
            throw new Error(`Unknown view type: ${meta.type}`);
          }
        }

        break;
      }

      default: {
        throw new Error(`Unhandled payload type: ${payload.type}`);
      }
    }

    return {
      statusCode: 200,
      body: "",
    };
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

export const manualStart: APIGatewayProxyHandler = async (event) =>
  await handleSlackRequest(event, async (params) => {
    const now = new Date().getTime();

    const slackId = params.get("user_id")!;
    const day = params.get("text");

    if (
      !day ||
      !Number.isInteger(Number(day)) ||
      Number(day) < 1 ||
      Number(day) > 25
    ) {
      return Promise.resolve({
        statusCode: 200,
        body: "Invalid day specified. Please provide a number between 1 and 25.",
      });
    }

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
  });

const LEADERBOARD_RESPONSE_TEMPLATE = JSON.stringify({
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Here are the *Advent of Code* results and leaderboard as of *Day {{ day }}*. Congratulations to the participants who solved one or both parts of the challenge!`,
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
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "{{ competitiveDailyLeaderboard }}",
      },
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":christmas_tree:  Overall Leaderboard",
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "The overall leaderboard is determined by the total number of stars earned by a participant. Ties will be broken using the total duration as of December 25th at 12 CST. Competitive division participants are denoted with a *",
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
        text: "{{ overallLeaderboard }}",
      },
    },
  ],
});

export const leaderboard: APIGatewayProxyHandler = async (event) =>
  await handleSlackRequest(event, async (params) => {
    const slackId = params.get("user_id")!;
    const day = params.get("text");

    if (
      !day ||
      !Number.isInteger(Number(day)) ||
      Number(day) < 1 ||
      Number(day) > 25
    ) {
      return Promise.resolve({
        statusCode: 200,
        body: "Invalid day specified. Please provide a number between 1 and 25.",
      });
    }

    // NOTE - Advent of Code asks that you do not request your leaderboard
    // JSON more than once per 15 minutes. To prevent accidental spam by users,
    // this command is locked down to the specified admin user ("facilitator").

    if (slackId !== configuration.slack.aocAdminId) {
      return {
        statusCode: 200,
        body: "Due to API restrictions, only your Advent of Code facilitator can use this command",
      };
    }

    // NOTE - Display leaderboard in Slack channel.

    const blocks = await getLeaderboardBlocks(day);

    const slackClient = new SlackClient(configuration.slack.token);

    await slackClient.chat.postMessage({
      channel: params.get("channel_id")!,
      blocks,
    });

    return {
      statusCode: 200,
      body: "",
    };
  });

async function handleSlackRequest(
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

    var response = await callback(params);

    return response;
  } catch (error) {
    console.error(error);

    return Promise.resolve({
      statusCode: 200,
      body: "Something went wrong. Please try again later.",
    });
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

async function getLeaderboardBlocks(day: string) {
  // NOTE - Fetch the leaderboard.

  const leaderboardService = new LeaderboardService();
  const leaderboard = await leaderboardService.get();

  // NOTE - Fetch any manual timing for the day and create a lookup.

  const manualTimingService = new ManualTimingService();
  const manualTimings = await manualTimingService.getAllByDay(day);

  const manualTimingLookup = manualTimings.reduce((lookup, manualTiming) => {
    lookup.set(manualTiming.aocId, manualTiming);
    return lookup;
  }, new Map<string, ManualTiming>());

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
    .filter((x) => x.division === Divisions.COMPETITIVE && x.totalDuration > 0)
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
    .join("\\n\\n");

  if (competitiveDailyLeaderboard.length === 0) {
    competitiveDailyLeaderboard = "-";
  }

  // NOTE - Overall leaderboard.

  const overallStarGroups = participantStatistics
    .filter((x) => x.stars > 0)
    .reduce<Record<string, ReturnType<typeof calculateParticipantStatistics>>>(
      (starGroups, statistics) => {
        if (!starGroups[statistics.stars]) {
          starGroups[statistics.stars] = [];
        }

        starGroups[statistics.stars].push(statistics);
        return starGroups;
      },
      {}
    );

  let overallLeaderboard = Object.entries(overallStarGroups)
    .sort(([xStars], [yStars]) => Number(yStars) - Number(xStars))
    .map(([stars, participantStatistics], i, starGroups) => {
      const rank =
        starGroups
          .slice(0, i)
          .map((x) => x[1].length)
          .reduce((sum, cur) => (sum += cur), 0) + 1;

      return `${rank}. ${participantStatistics
        .sort((x, y) => x.sortKey.localeCompare(y.sortKey))
        .map(
          (x) =>
            `${x.name}${
              x.division === Divisions.COMPETITIVE ? "\\u00ad*\\u00ad" : ""
            }`
        )
        .join(", ")} (${stars})`;
    })
    .join("\\n\\n");

  if (overallLeaderboard.length === 0) {
    overallLeaderboard = "-";
  }

  return JSON.parse(
    LEADERBOARD_RESPONSE_TEMPLATE.replaceAll("{{ day }}", day)
      .replaceAll("{{ year }}", configuration.aoc.year)
      .replaceAll("{{ leaderboardId }}", configuration.aoc.leaderboardId)
      .replaceAll("{{ funBothParts }}", funBothParts)
      .replaceAll("{{ funFirstPart }}", funFirstPart)
      .replaceAll(
        "{{ competitiveDailyLeaderboard }}",
        competitiveDailyLeaderboard
      )
      .replaceAll("{{ overallLeaderboard }}", overallLeaderboard)
  ).blocks;
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
