import { createClient, SupabaseClient } from "@supabase/supabase-js";

import type { Database, TablesInsert } from "../types/database.types.ts";

export class SupabaseService {
    private readonly _supabase: SupabaseClient<Database>;

    constructor() {
        this._supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
        );
    }

    async initialize() {
        const { error } = await this._supabase.auth.signInWithPassword({
            email: Deno.env.get("DB_EMAIL")!,
            password: Deno.env.get("DB_PASSWORD")!,
        });

        if (error) {
            throw error;
        }
    }

    async getAllParticipants() {
        const { data, error } = await this._supabase
            .from("participants")
            .select();

        if (error) {
            throw error;
        }

        return data;
    }

    async getParticipant(slack_id: string) {
        const { data, error } = await this._supabase
            .from("participants")
            .select()
            .eq("slack_id", slack_id);

        if (error) {
            throw error;
        }

        return data[0];
    }

    async upsertParticipant(
        participant: TablesInsert<"participants">,
    ) {
        const { data, error } = await this._supabase
            .from("participants")
            .upsert(
                { ...participant, updated_at: new Date().toISOString() },
                { onConflict: "slack_id" },
            )
            .select();

        if (error) {
            throw error;
        }

        return data[0];
    }

    async getAllEventParticipants() {
        const { data, error } = await this._supabase
            .from("event_participants")
            .select();

        if (error) {
            throw error;
        }

        return data;
    }

    async upsertEventParticipant(
        eventParticipant: TablesInsert<"event_participants">,
    ) {
        const { error } = await this._supabase
            .from("event_participants")
            .upsert(
                { ...eventParticipant, updated_at: new Date().toISOString() },
                { onConflict: "event,participant_id" },
            );

        if (error) {
            throw error;
        }
    }

    async upsertStartTimestampOverride(
        startTimestampOverride: TablesInsert<"start_timestamp_overrides">,
    ) {
        const { error } = await this._supabase
            .from("start_timestamp_overrides")
            .upsert(
                {
                    ...startTimestampOverride,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "participant_id,event,day" },
            );

        if (error) {
            throw error;
        }
    }

    async getDailyLeaderboard(day: number) {
        const { data, error } = await this._supabase
            .rpc("get_daily_leaderboard", {
                p_event: Deno.env.get("AOC_EVENT")!,
                p_day: day.toString(),
            });

        if (error) {
            throw error;
        }

        return data;
    }

    async getOverallLeaderboard(day: number) {
        const { data, error } = await this._supabase
            .rpc("get_overall_leaderboard", {
                p_event: Deno.env.get("AOC_EVENT")!,
                p_day: day.toString(),
            });

        if (error) {
            throw error;
        }

        return data;
    }
}
