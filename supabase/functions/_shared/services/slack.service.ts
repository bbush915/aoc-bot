import { type Block, WebClient } from "@slack/web-api";

export class SlackService {
    private readonly _client: WebClient;

    constructor() {
        this._client = new WebClient(Deno.env.get("SLACK_TOKEN")!);
    }

    async sendMessage(channelId: string, blocks: Block[]) {
        await this._client.chat.postMessage({
            channel: channelId,
            blocks,
        });
    }

    async updateMessage(channelId: string, timestamp: string, blocks: Block[]) {
        await this._client.chat.update({
            channel: channelId,
            ts: timestamp,
            blocks,
        });
    }

    async openRegistrationModal(triggerId: string, slackId: string) {
        await this._client.views.open({
            trigger_id: triggerId,
            view: {
                type: "modal",
                title: {
                    type: "plain_text",
                    text: "Registration",
                },
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "plain_text",
                            text:
                                "Please provide the information below to link your Advent of Code account.",
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
                        },
                        hint: {
                            type: "plain_text",
                            text:
                                "ONLY the first group of numbers of the code on the Settings page:\nExample: ownerproof-1234567-xxxxxxxxxx-xxxxxxxxxxxx => 1234567",
                        },
                    },
                    {
                        type: "input",
                        block_id: "division_block",
                        label: {
                            type: "plain_text",
                            text:
                                "What division do you want to participate in?",
                        },
                        element: {
                            type: "radio_buttons",
                            action_id: "division",
                            options: [
                                {
                                    text: {
                                        type: "plain_text",
                                        text: "Fun",
                                    },
                                    value: "fun",
                                },
                                {
                                    text: {
                                        type: "plain_text",
                                        text: "Competitive",
                                    },
                                    value: "competitive",
                                },
                            ],
                        },
                    },
                    {
                        type: "input",
                        block_id: "ai_usage_block",
                        label: {
                            type: "plain_text",
                            text:
                                "Which option best describes your planned usage of AI during the competition (e.g. Copilot or GPT)?",
                        },
                        element: {
                            type: "radio_buttons",
                            action_id: "ai_usage",
                            options: [
                                {
                                    text: {
                                        type: "plain_text",
                                        text: "None",
                                    },
                                    value: "none",
                                },
                                {
                                    text: {
                                        type: "plain_text",
                                        text:
                                            "Assistance (e.g. syntax, logic, algorithms, etc...)",
                                    },
                                    value: "assistance",
                                },
                                {
                                    text: {
                                        type: "plain_text",
                                        text:
                                            "Automation (e.g. mostly / completely solving the puzzle)",
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
                },
                submit: {
                    type: "plain_text",
                    text: "Register",
                },
                private_metadata: JSON.stringify({
                    type: "registration",
                    data: { slackId },
                }),
            },
        });
    }
}
