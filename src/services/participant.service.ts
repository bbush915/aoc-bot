import { DynamoDB as DynamoDbClient } from "@aws-sdk/client-dynamodb";
import { WebClient as SlackClient } from "@slack/web-api";

import configuration from "../configuration";

export type Participant = {
  slackId: string;
  aocId: string;
  division: Divisions;
  aiUsageType: AIUsageTypes;
};

export enum Divisions {
  FUN = "fun",
  COMPETITIVE = "competitive",
}

export enum AIUsageTypes {
  NONE = "none",
  ASSISTANCE = "assistance",
  AUTOMATION = "automation",
}

export class ParticipantService {
  private readonly _dynamoDbClient: DynamoDbClient;
  private readonly _slackClient: SlackClient;

  constructor() {
    this._dynamoDbClient = new DynamoDbClient({});
    this._slackClient = new SlackClient(configuration.slack.token);
  }

  async openRegistrationModal(triggerId: string, slackId: string) {
    await this._slackClient.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        title: {
          type: "plain_text",
          text: "Registration",
          emoji: true,
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: "Please provide the information below to link your Advent of Code account.",
              emoji: true,
            },
          },
          {
            type: "divider",
          },
          {
            type: "input",
            block_id: "aoc_id_block",
            element: {
              type: "number_input",
              action_id: "aoc_id",
              is_decimal_allowed: false,
            },
            label: {
              type: "plain_text",
              text: "What is your Advent of Code ID?",
              emoji: true,
            },
            hint: {
              type: "plain_text",
              text: "ONLY the first group of numbers of the code on the Settings page:\nExample: ownerproof-1234567-xxxxxxxxxx-xxxxxxxxxxxx => 1234567",
              emoji: true,
            },
          },
          {
            type: "input",
            block_id: "division_block",
            label: {
              type: "plain_text",
              text: "What division do you want to participate in?",
              emoji: true,
            },
            element: {
              type: "radio_buttons",
              action_id: "division",
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: "Fun",
                    emoji: true,
                  },
                  value: "fun",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Competitive",
                    emoji: true,
                  },
                  value: "competitive",
                },
              ],
            },
          },
          {
            type: "input",
            block_id: "ai_usage_type_block",
            label: {
              type: "plain_text",
              text: "Which option best describes your planned usage of AI during the competition (e.g. Copilot or GPT)?",
              emoji: true,
            },
            element: {
              type: "radio_buttons",
              action_id: "ai_usage_type",
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: "None",
                    emoji: true,
                  },
                  value: "none",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Assistance (e.g. syntax, logic, algorithms, etc...)",
                    emoji: true,
                  },
                  value: "assistance",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Automation (e.g. mostly / completely solving the puzzle)",
                    emoji: true,
                  },
                  value: "automation",
                },
              ],
            },
          },
        ],
        close: {
          type: "plain_text",
          text: "Cancel",
          emoji: true,
        },
        submit: {
          type: "plain_text",
          text: "Register",
          emoji: true,
        },
        private_metadata: JSON.stringify({
          type: "REGISTRATION",
          data: { slackId },
        }),
      },
    });
  }

  async get(slackId: string) {
    const output = await this._dynamoDbClient.getItem({
      TableName: "aoc-participants",
      Key: { SlackId: { S: slackId } },
      ProjectionExpression: "AocId, Division, AiUsageType",
    });

    if (!output.Item) {
      throw new Error(`Unable to locate participant: [Slack ID: ${slackId}]`);
    }

    const participant: Participant = {
      slackId,
      aocId: output.Item.AocId.S!,
      division: output.Item.Division.S! as Divisions,
      aiUsageType: (output.Item.AiUsageType?.S ??
        AIUsageTypes.NONE) as AIUsageTypes,
    };

    return participant;
  }

  async getAll() {
    const output = await this._dynamoDbClient.scan({
      TableName: "aoc-participants",
      ProjectionExpression: "SlackId, AocId, Division, AiUsageType",
    });

    const participants: Participant[] = output.Items!.map((item) => ({
      slackId: item.SlackId.S!,
      aocId: item.AocId.S!,
      division: item.Division.S! as Divisions,
      aiUsageType: (item.AiUsageType?.S ?? AIUsageTypes.NONE) as AIUsageTypes,
    }));

    return participants;
  }

  async upsert(participant: Participant) {
    await this._dynamoDbClient.updateItem({
      TableName: "aoc-participants",
      Key: { SlackId: { S: participant.slackId } },
      UpdateExpression:
        "SET AocId = :AocId, Division = :Division, AiUsageType = :AiUsageType",
      ExpressionAttributeValues: {
        ":AocId": { S: participant.aocId },
        ":Division": { S: participant.division },
        ":AiUsageType": { S: participant.aiUsageType },
      },
    });
  }
}
