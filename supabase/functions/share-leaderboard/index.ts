import { LeaderboardService } from "../_shared/services/leaderboard.service.ts";
import { SlackService } from "../_shared/services/slack.service.ts";
import { handleSlackRequest } from "../_shared/utils/slack.utils.ts";

Deno.serve(
  (request) => {
    return handleSlackRequest(
      request,
      async (params) => {
        const slackId = params.get("user_id")!;
        const channelId = params.get("channel_id")!;

        const day = params.get("text");

        if (
          !day ||
          !Number.isInteger(Number(day)) ||
          Number(day) < 1 ||
          Number(day) > 25
        ) {
          return new Response(
            "Invalid day specified. Please provide a number between 1 and 25.",
          );
        }

        if (slackId !== Deno.env.get("SLACK_AOC_ADMIN_ID")!) {
          return new Response(
            "Only your Advent of Code facilitator can use this command.",
          );
        }

        const leaderboardService = new LeaderboardService();

        await leaderboardService.initialize();

        const blocks = await leaderboardService.getLeaderboardBlocks(
          Number(day),
        );

        const slackService = new SlackService();

        await slackService.sendMessage(channelId, blocks);

        return new Response();
      },
    );
  },
);
