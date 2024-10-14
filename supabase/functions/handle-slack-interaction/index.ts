import { LeaderboardService } from "../_shared/services/leaderboard.service.ts";
import { SlackService } from "../_shared/services/slack.service.ts";
import { SupabaseService } from "../_shared/services/supabase.service.ts";
import { handleSlackRequest } from "../_shared/utils/slack.utils.ts";
import { CallbackTypes, PayloadTypes, ViewTypes } from "./types.ts";

Deno.serve(
  (request) => {
    return handleSlackRequest(
      request,
      async (params) => {
        const payload = JSON.parse(params.get("payload")!);

        switch (payload.type) {
          case PayloadTypes.BLOCK_ACTIONS: {
            break;
          }

          case PayloadTypes.MESSAGE_ACTION: {
            switch (payload.callback_id) {
              case CallbackTypes.REFRESH_LEADERBOARD: {
                const user = payload.user;

                if (user.id !== Deno.env.get("SLACK_AOC_ADMIN_ID")!) {
                  return new Response(
                    "Only your Advent of Code facilitator can perform this action.",
                  );
                }

                // NOTE - Grab day number from mesage.

                const day =
                  payload.message.blocks[0].text.text.match(/Day (\d+)/)[1];

                // NOTE - Update leaderboard.

                const leaderboardService = new LeaderboardService();

                await leaderboardService.initialize();

                const blocks = await leaderboardService.getLeaderboardBlocks(
                  Number(day),
                );

                const slackService = new SlackService();

                await slackService.updateMessage(
                  payload.channel.id,
                  payload.message_ts,
                  blocks,
                );

                break;
              }

              default: {
                throw new Error(`Unhandled callback: ${payload.callback_id}`);
              }
            }

            break;
          }

          case PayloadTypes.VIEW_SUBMISSION: {
            const view = payload.view;
            const meta = JSON.parse(view.private_metadata);

            switch (meta.type) {
              case ViewTypes.REGISTRATION: {
                const { slackId } = meta.data;

                const {
                  aoc_id_block: { aoc_id: { value: aocId } },
                  division_block: {
                    division: { selected_option: { value: division } },
                  },
                  ai_usage_block: {
                    ai_usage: { selected_option: { value: aiUsage } },
                  },
                } = view.state.values;

                const supabaseService = new SupabaseService();

                await supabaseService.initialize();

                const participant = await supabaseService.upsertParticipant({
                  slack_id: slackId,
                  aoc_id: aocId,
                });

                await supabaseService.upsertEventParticipant({
                  participant_id: participant.id,
                  event: Deno.env.get("AOC_EVENT")!,
                  division,
                  ai_usage: aiUsage,
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

        return new Response();
      },
    );
  },
);
