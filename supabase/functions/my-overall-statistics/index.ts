import { SupabaseService } from "../_shared/services/supabase.service.ts";
import {
  formatTime,
  handleSlackRequest,
} from "../_shared/utils/slack.utils.ts";

const MY_OVERALL_STATISTICS_RESPONSE_TEMPLATE = JSON.stringify({
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `Your overall statistics are shown below:\n\n*Rank:* {{ rank }}\n\n*Stars:* {{ stars }}\n\n*Total:* {{ total }}`,
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

        const supabaseService = new SupabaseService();

        await supabaseService.initialize();

        // NOTE - Fetch the participant.

        const participant = await supabaseService.getParticipant(slackId);

        if (!participant) {
          return new Response(
            "You have not registered yet. Please register using the `/aoc register` command first.",
          );
        }

        // NOTE - Fetch the overall statistics.

        const overallLeaderboard = await supabaseService.getOverallLeaderboard(
          25,
        );

        const overallStatistics = overallLeaderboard.find((x) =>
          x.aoc_id === participant.aoc_id
        );

        return new Response(
          MY_OVERALL_STATISTICS_RESPONSE_TEMPLATE
            .replaceAll("{{ rank }}", overallStatistics?.rank.toString() ?? "-")
            .replaceAll(
              "{{ stars }}",
              overallStatistics?.total_stars.toString() ?? "0",
            )
            .replaceAll(
              "{{ total }}",
              overallStatistics
                ? formatTime(overallStatistics.total_duration)
                : "-",
            ),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    );
  },
);
