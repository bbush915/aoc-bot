import { DynamoDB } from "@aws-sdk/client-dynamodb";

export type ManualTiming = {
  day: string;
  aocId: string;
  startTimestamp: number;
};

export class ManualTimingService {
  private readonly _client: DynamoDB;

  constructor() {
    this._client = new DynamoDB({});
  }

  async getAllByDay(day: string) {
    const manualTimingData = await this._client.query({
      TableName: "aoc-manual-timing",
      KeyConditionExpression: "DayNumber = :DayNumber",
      ExpressionAttributeValues: {
        ":DayNumber": { N: day },
      },
      ProjectionExpression: "AocId, StartTimestamp",
    });

    const manualTimings: ManualTiming[] = manualTimingData.Items!.map(
      (item) => ({
        day,
        aocId: item.AocId.S!,
        startTimestamp: Number(item.StartTimestamp.N!),
      })
    );

    return manualTimings;
  }

  async upsert(manualTiming: ManualTiming) {
    await this._client.updateItem({
      TableName: "aoc-manual-timing",
      Key: {
        DayNumber: { N: manualTiming.day },
        AocId: { S: manualTiming.aocId },
      },
      UpdateExpression: "SET StartTimestamp = :StartTimestamp",
      ExpressionAttributeValues: {
        ":StartTimestamp": { N: String(manualTiming.startTimestamp) },
      },
    });
  }
}
