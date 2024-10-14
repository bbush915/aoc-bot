import { formatStar, formatTime } from "../utils/slack.utils.ts";
import { SupabaseService } from "./supabase.service.ts";

const LEADERBOARD_RESPONSE_TEMPLATE = JSON.stringify({
    blocks: [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text:
                    `Here are the *Advent of Code* results and leaderboard as of *Day {{ day }}*. Congratulations to the participants who solved one or both parts of the challenge!`,
            },
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Challenge",
                        emoji: true,
                    },
                    value: "challenge",
                    url: `https://adventofcode.com/{{ year }}/day/{{ day }}`,
                },
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Full Leaderboard",
                        emoji: true,
                    },
                    value: "full_leaderboard",
                    url: `https://adventofcode.com/{{ year }}/leaderboard/private/view/{{ leaderboardId }}`,
                },
            ],
        },
        {
            type: "header",
            text: {
                type: "plain_text",
                text: ":tada:  For fun!",
                emoji: true,
            },
        },
        {
            type: "divider",
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text:
                    ":star: {{ funBothParts }}\n\n:star-empty: {{ funFirstPart }}",
            },
        },
        {
            type: "header",
            text: {
                type: "plain_text",
                text: ":trophy:  For bragging rights!",
                emoji: true,
            },
        },
        {
            type: "divider",
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "{{ competitiveDailyLeaderboard }}",
            },
        },
        {
            type: "header",
            text: {
                type: "plain_text",
                text: ":christmas_tree:  Overall Leaderboard",
                emoji: true,
            },
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text:
                        "The overall leaderboard is determined by the total number of stars earned by a participant. Ties will be broken using the total duration. Competitive division participants are denoted with a *",
                },
            ],
        },
        {
            type: "divider",
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "{{ overallLeaderboard }}",
            },
        },
        {
            type: "divider",
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text:
                        "_Last Updated: <!date^{{ timestamp }}^{date} {time_secs}|Unable to Parse Timestamp>_",
                },
            ],
        },
    ],
});

export class LeaderboardService {
    private readonly _supabaseService: SupabaseService;

    constructor() {
        this._supabaseService = new SupabaseService();
    }

    async initialize() {
        await this._supabaseService.initialize();
    }

    async getLeaderboardBlocks(day: number) {
        // NOTE - Get leaderboard data.

        const dailyLeaderboard = await this._supabaseService
            .getDailyLeaderboard(day);

        const overallLeaderboard = await this._supabaseService
            .getOverallLeaderboard(day);

        // NOTE - Daily leaderboard.

        // NOTE - Fun division.

        let dailyFunBothParts = dailyLeaderboard
            .filter((x) => !x.is_competitive && x.daily_stars === 2)
            .sort((x, y) => {
                // NOTE - Sort by total stars, then by name.

                if (x.total_stars === y.total_stars) {
                    return x.raw_name.localeCompare(y.raw_name);
                }

                return y.total_stars - x.total_stars;
            })
            .map((x) => `${x.name} (${x.total_stars})`)
            .join(", ");

        if (dailyFunBothParts.length === 0) {
            dailyFunBothParts = "-";
        }

        let dailyFunFirstPart = dailyLeaderboard
            .filter((x) => !x.is_competitive && x.daily_stars === 1)
            .sort((x, y) => {
                // NOTE - Sort by total stars, then by name.

                if (x.total_stars === y.total_stars) {
                    return x.raw_name.localeCompare(y.raw_name);
                }

                return y.total_stars - x.total_stars;
            })
            .map((x) => `${x.name} (${x.total_stars})`)
            .join(", ");

        if (dailyFunFirstPart.length === 0) {
            dailyFunFirstPart = "-";
        }

        // NOTE - Competitive division.

        let dailyCompetitive = dailyLeaderboard
            .filter((x) => x.is_competitive)
            .map((x) =>
                `${x.competitive_rank}. ${x.name} (${
                    formatStar(x.daily_stars)
                }, P1: ${formatTime(x.part_1_duration)}${
                    x.daily_stars === 2
                        ? `, P2: ${formatTime(x.part_2_duration)}, Total: ${
                            formatTime(x.total_duration)
                        }`
                        : ""
                })`
            )
            .join("\\n\\n");

        if (dailyCompetitive.length === 0) {
            dailyCompetitive = "-";
        }

        // NOTE - Overall leaderboard.

        let overall = overallLeaderboard
            .map((x) =>
                `${x.rank}. ${x.name}${
                    x.is_competitive ? "\\u00ad*\\u00ad" : ""
                } (${x.total_stars}${
                    x.is_competitive ? `, ${formatTime(x.total_duration)}` : ""
                })`
            )
            .join("\\n\\n");

        if (overall.length === 0) {
            overall = "-";
        }

        return JSON.parse(
            LEADERBOARD_RESPONSE_TEMPLATE
                .replaceAll("{{ day }}", day.toString())
                .replaceAll("{{ year }}", Deno.env.get("AOC_EVENT")!)
                .replaceAll(
                    "{{ leaderboardId }}",
                    Deno.env.get("AOC_LEADERBOARD_ID")!,
                )
                .replaceAll("{{ funBothParts }}", dailyFunBothParts)
                .replaceAll("{{ funFirstPart }}", dailyFunFirstPart)
                .replaceAll(
                    "{{ competitiveDailyLeaderboard }}",
                    dailyCompetitive,
                )
                .replaceAll("{{ overallLeaderboard }}", overall)
                .replaceAll(
                    "{{ timestamp }}",
                    String(Math.floor(new Date().getTime() / 1000)),
                ),
        ).blocks;
    }
}
