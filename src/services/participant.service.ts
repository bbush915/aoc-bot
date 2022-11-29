import { DynamoDB } from "@aws-sdk/client-dynamodb";

export type Participant = {
  slackId: string;
  aocId: string;
  division: Divisions;
};

export enum Divisions {
  FUN = "fun",
  COMPETITIVE = "competitive",
}

export class ParticipantService {
  private readonly _client: DynamoDB;

  constructor() {
    this._client = new DynamoDB({});
  }

  async get(slackId: string) {
    const output = await this._client.getItem({
      TableName: "aoc-participants",
      Key: { SlackId: { S: slackId } },
      ProjectionExpression: "AocId, Division",
    });

    if (!output.Item) {
      throw new Error(`Unable to locate participant: [Slack ID: ${slackId}]`);
    }

    const participant: Participant = {
      slackId,
      aocId: output.Item.AocId.S!,
      division: output.Item.Division.S! as Divisions,
    };

    return participant;
  }

  async getAll() {
    const output = await this._client.scan({
      TableName: "aoc-participants",
      ProjectionExpression: "SlackId, AocId, Division",
    });

    const participants: Participant[] = output.Items!.map((item) => ({
      slackId: item.SlackId.S!,
      aocId: item.AocId.S!,
      division: item.Division.S! as Divisions,
    }));

    return participants;
  }

  async upsert(participant: Participant) {
    await this._client.updateItem({
      TableName: "aoc-participants",
      Key: { SlackId: { S: participant.slackId } },
      UpdateExpression: "SET AocId = :AocId, Division = :Division",
      ExpressionAttributeValues: {
        ":AocId": { S: participant.aocId },
        ":Division": { S: participant.division },
      },
    });
  }
}
