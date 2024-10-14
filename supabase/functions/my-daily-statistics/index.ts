import { SupabaseService } from "../_shared/services/supabase.service.ts";
import {
  formatTime,
  handleSlackRequest,
} from "../_shared/utils/slack.utils.ts";

const MY_DAILY_STATISTICS_RESPONSE_TEMPLATE = JSON.stringify({
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `Your *Day {{ day }}* statistics are shown below:\n\n*Rank:* {{ rank }}\n\n*Part 1:* {{ part1 }}\n\n*Part 2:* {{ part2 }}\n\n*Total:* {{ total }}`,
      },
    },
  ],
});

Deno.serve(
  (request) => {
    return handleSlackRequest(
      request,
      async (params) => {
        const slackId = params.get("user_id")!;
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

        const supabaseService = new SupabaseService();

        await supabaseService.initialize();

        // NOTE - Fetch the participant.

        const participant = await supabaseService.getParticipant(slackId);

        if (!participant) {
          return new Response(
            "You have not registered yet. Please register using the `/aoc register` command first.",
          );
        }

        // NOTE - Fetch the daily statistics.

        const dailyLeaderboard = await supabaseService.getDailyLeaderboard(
          Number(day),
        );

        const dailyStatistics = dailyLeaderboard.find((x) =>
          x.aoc_id === participant.aoc_id
        );

        return new Response(
          MY_DAILY_STATISTICS_RESPONSE_TEMPLATE
            .replaceAll("{{ day }}", day)
            .replaceAll("{{ rank }}", dailyStatistics?.rank.toString() ?? "-")
            .replaceAll(
              "{{ part1 }}",
              dailyStatistics
                ? formatTime(dailyStatistics.part_1_duration)
                : "-",
            )
            .replaceAll(
              "{{ part2 }}",
              dailyStatistics
                ? formatTime(dailyStatistics.part_2_duration)
                : "-",
            )
            .replaceAll(
              "{{ total }}",
              dailyStatistics
                ? formatTime(dailyStatistics.total_duration)
                : "-",
            ),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    );
  },
);
