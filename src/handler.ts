import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyHandler, ProxyResult } from "aws-lambda";
import axios from "axios";
import { createHmac, timingSafeEqual } from "crypto";

import { Leaderboard, ManualTiming } from "types";

// NOTE - Advent of Code starts December 1st at 12 AM EST / UTC-5

const EVENT_START_TIMESTAMP = new Date(Number(process.env.AOC_YEAR!), 11, 1, 5, 0, 0, 0).getTime();

export const register: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const slackId = params.get("user_id")!;
      const aocId = params.get("text")!;

      // NOTE - Update the translation for the user.

      const dbClient = new DynamoDB({});

      await dbClient.updateItem({
        TableName: "aoc-user-translation",
        Key: { SlackId: { S: slackId } },
        UpdateExpression: "SET AocId = :AocId",
        ExpressionAttributeValues: {
          ":AocId": { S: aocId },
        },
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

export const manualStart: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const slackId = params.get("user_id")!;
      let day = params.get("text")!;

      const now = new Date().getTime();

      // NOTE - If we don't provide a day, calculate it from the offset to the
      // start of the event.

      if (!day) {
        day = String(1 + Math.floor((now - EVENT_START_TIMESTAMP) / (24 * 60 * 60 * 1000)));
      }

      // NOTE - Grab the translation for the user.

      const dbClient = new DynamoDB({});

      const userTranslationData = await dbClient.getItem({
        TableName: "aoc-user-translation",
        Key: { SlackId: { S: slackId } },
        ProjectionExpression: "AocId",
      });

      if (!userTranslationData.Item) {
        throw new Error(`Unable to locate translation for user: [Slack ID: ${slackId}]`);
      }

      // NOTE - Update the manual start time for the user for the day.

      const aocId = userTranslationData.Item.AocId.S!;

      await dbClient.updateItem({
        TableName: "aoc-manual-timing",
        Key: { DayNumber: { N: day }, MemberId: { S: aocId } },
        UpdateExpression: "SET StartTimestamp = :StartTimestamp",
        ExpressionAttributeValues: {
          ":StartTimestamp": { N: String(now) },
        },
      });

      // NOTE - Inform the user that they can begin!

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:clipboard: Recorded your *Day ${day}* start time as: *<!date^${Math.floor(
                  now / 1000
                )}^{date} {time_secs}|Unable to Parse Timestamp>*\n\n:runner: You can now begin: https://adventofcode.com/${process
                  .env.AOC_YEAR!}/day/${day}`,
              },
            },
          ],
        }),
      };
    } catch (error) {
      console.error(error);

      return Promise.resolve({
        statusCode: 200,
        body: "Something went wrong. Please try again later.",
      });
    }
  });

export const leaderboard: APIGatewayProxyHandler = (event) =>
  handleSlackRequest(event, async (params) => {
    try {
      const slackId = params.get("user_id")!;
      let day = params.get("text")!;

      const now = new Date().getTime();

      // NOTE - If we don't provide a day, calculate it from the offset to the
      // start of the event.

      if (!day) {
        day = String(1 + Math.floor((now - EVENT_START_TIMESTAMP) / (24 * 60 * 60 * 1000)));
      }

      // NOTE - Advent of Code requests that you do not request your leaderboard
      // JSON more than once per 15 minutes. To prevent accidental spam by users,
      // this command is locked down to the specified admin user ("facilitator").

      if (slackId !== process.env.SLACK_AOC_ADMIN_ID!) {
        return {
          statusCode: 200,
          body: "Due to API restrictions, only your Advent of Code facilitator can use this command",
        };
      }

      // NOTE - Get leaderboard JSON.

      const response = await axios.get(
        `https://adventofcode.com/${process.env.AOC_YEAR}/leaderboard/private/view/${process.env.AOC_LEADERBOARD_ID}.json`,
        {
          headers: {
            Cookie: `session=${process.env.AOC_SESSION_COOKIE};`,
          },
        }
      );

      const leaderboard: Leaderboard = response.data;

      // NOTE - Get any manual start times for the given day.

      const dbClient = new DynamoDB({});

      const manualTimingData = await dbClient.query({
        TableName: "aoc-manual-timing",
        KeyConditionExpression: "DayNumber = :DayNumber",
        ExpressionAttributeValues: {
          ":DayNumber": { N: String(day) },
        },
        ProjectionExpression: "MemberId,StartTimestamp",
      });

      const manualTimings: ManualTiming[] = manualTimingData.Items!.map((item) => ({
        member_id: item.MemberId.S!,
        start_ts: Number(item.StartTimestamp.N!),
      }));

      // NOTE - Calculate leaderboard statistics.

      const leaderboardStatistics = calculateLeaderboardStatistics(
        Number(day),
        leaderboard,
        manualTimings
      );

      const overallLeaders = leaderboardStatistics.sort((x, y) => y.localScore - x.localScore);

      const dailyLeaders = leaderboardStatistics
        .filter((x) => x.totalDuration > 0)
        .sort((x, y) => {
          if (x.dailyStars === y.dailyStars) {
            return x.totalDuration - y.totalDuration;
          }

          return y.dailyStars - x.dailyStars;
        });

      // NOTE - Display leaderboard in Slack channel.

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          response_type: "in_channel",
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: ":star: Overall Leaderboard :star:",
              },
            },
            {
              type: "divider",
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: overallLeaders
                  .map(
                    ({ name, localScore }, index) => `${formatMedal(index)}${name} (${localScore})`
                  )
                  .join("\n\n"),
              },
            },
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `:stopwatch: Day ${day} Leaderboard :stopwatch:`,
              },
            },
            {
              type: "divider",
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: dailyLeaders
                  .map(
                    ({ name, dailyStars, totalDuration }, index) =>
                      `${formatMedal(index)}${name} (${formatStars(dailyStars)} ${formatTime(
                        totalDuration
                      )})`
                  )
                  .join("\n\n"),
              },
            },
          ],
        }),
      };
    } catch (error) {
      console.error(error);

      return Promise.resolve({
        statusCode: 200,
        body: "Something went wrong. Please try again later.",
      });
    }
  });

const handleSlackRequest = (
  event: APIGatewayProxyEvent,
  callback: (params: URLSearchParams) => Promise<ProxyResult>
) => {
  try {
    verifySlackRequest(event);

    // NOTE - Parse the Slack slash command parameters.

    const params = new URLSearchParams(Buffer.from(event.body!, "base64").toString("utf-8"));

    // NOTE - Execute the callback for the given parameters.

    return callback(params);
  } catch (error) {
    console.error(error);

    return Promise.resolve({
      statusCode: 200,
      body: "Something went wrong. Please try again later.",
    }) as ReturnType<APIGatewayProxyHandler>;
  }
};

const verifySlackRequest = ({ body, headers }: APIGatewayProxyEvent) => {
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
};

const calculateLeaderboardStatistics = (
  day: number,
  { members }: Leaderboard,
  manualTimings: ManualTiming[]
) => {
  const manualTimingMap = new Map(
    manualTimings.map(({ member_id, start_ts }) => [member_id, start_ts])
  );

  return Object.values(members).map((member) => {
    const manualTiming = manualTimingMap.get(member.id);

    // NOTE - If we have a manual start time, then we will use it, otherwise we
    // can calculate it relative to the event start timestamp.

    const startTimestamp = manualTiming ?? EVENT_START_TIMESTAMP + (day - 1) * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = EVENT_START_TIMESTAMP + day * 24 * 60 * 60 * 1000;

    // NOTE - We sum up all stars up to and including the given day. For the
    // given day, we also calculate how long it took to solve each part. In
    // addition, we determine the last star timestamp to use for tiebreakers.

    let stars = 0;
    let partOneDuration = 0;
    let partTwoDuration = 0;
    let lastStarTimestamp = 0;

    for (const entry of Object.entries(member.completion_day_level)) {
      const memberDay = Number(entry[0]);
      const dailyCompletionStatistics = entry[1];

      if (memberDay > day) {
        continue;
      } else if (memberDay === day) {
        const partOneStatistics = dailyCompletionStatistics[1];

        stars++;
        partOneDuration = partOneStatistics.get_star_ts * 1000 - startTimestamp;
        lastStarTimestamp = partOneStatistics.get_star_ts * 1000;

        const partTwoStatistics = dailyCompletionStatistics[2];

        if (partTwoStatistics) {
          stars++;
          partTwoDuration = 1000 * (partTwoStatistics.get_star_ts - partOneStatistics.get_star_ts);
          lastStarTimestamp = partTwoStatistics.get_star_ts * 1000;
        }
      } else {
        for (const { get_star_ts } of Object.values(dailyCompletionStatistics)) {
          stars++;

          if (get_star_ts * 1000 > lastStarTimestamp) {
            lastStarTimestamp = get_star_ts * 1000;
          }
        }
      }
    }

    return {
      name: member.name,
      localScore: member.local_score,
      stars,
      dailyStars: (partOneDuration > 0 ? 1 : 0) + (partTwoDuration > 0 ? 1 : 0),
      lastStarTimestamp: Math.min(lastStarTimestamp, cutoffTimestamp),
      partOneDuration,
      partTwoDuration,
      totalDuration: partOneDuration + partTwoDuration,
    };
  });
};

const formatMedal = (index: number) => {
  switch (index) {
    case 0: {
      return ":first_place_medal: ";
    }

    case 1: {
      return ":second_place_medal: ";
    }

    case 2: {
      return ":third_place_medal: ";
    }
  }

  return "        ";
};

const formatStars = (dailyStars: number) => (dailyStars === 2 ? ":star:" : ":star-empty:");

const formatTime = (value: number) => {
  const hours = Math.floor(value / (1000 * 60 * 60));
  const minutes = Math.floor(value / (1000 * 60)) % 60;
  const seconds = Math.floor(value / 1000) % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
};
