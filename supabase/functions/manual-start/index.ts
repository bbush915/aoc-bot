import { SupabaseService } from "../_shared/services/supabase.service.ts";
import { handleSlackRequest } from "../_shared/utils/slack.utils.ts";

const MANUAL_START_RESPONSE_TEMPLATE = JSON.stringify({
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `:clipboard: Recorded your *Day {{ day }}* start time as: *<!date^{{ timestamp }}^{date} {time_secs}|Unable to Parse Timestamp>*\n\n:runner: You can now begin: https://adventofcode.com/{{ year }}/day/{{ day }}`,
      },
    },
  ],
});

Deno.serve(
  (request) => {
    return handleSlackRequest(
      request,
      async (params) => {
        const now = new Date().getTime();

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

        // NOTE - Record their start time.

        await supabaseService.upsertStartTimestampOverride({
          participant_id: participant.id,
          event: Deno.env.get("AOC_EVENT")!,
          day: Number(day),
          start_timestamp: Math.floor(new Date(now).getTime() / 1000),
        });

        // NOTE - Tell the participant to begin.

        return new Response(
          MANUAL_START_RESPONSE_TEMPLATE
            .replaceAll("{{ day }}", day)
            .replaceAll("{{ year }}", Deno.env.get("AOC_EVENT")!)
            .replaceAll("{{ timestamp }}", String(Math.floor(now / 1000))),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    );
  },
);
