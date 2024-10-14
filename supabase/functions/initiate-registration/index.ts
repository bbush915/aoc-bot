import { SlackService } from "../_shared/services/slack.service.ts";
import { handleSlackRequest } from "../_shared/utils/slack.utils.ts";

Deno.serve(
  (request) => {
    return handleSlackRequest(
      request,
      async (params) => {
        const triggerId = params.get("trigger_id")!;
        const slackId = params.get("user_id")!;

        const slackService = new SlackService();

        await slackService.openRegistrationModal(triggerId, slackId);

        return new Response();
      },
    );
  },
);
