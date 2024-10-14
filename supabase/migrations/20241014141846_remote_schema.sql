

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_daily_leaderboard"("p_event" "text", "p_day" "text") RETURNS TABLE("aoc_id" "text", "rank" bigint, "competitive_rank" bigint, "raw_name" "text", "name" "text", "is_competitive" boolean, "part_1_duration" bigint, "part_2_duration" bigint, "total_duration" bigint, "daily_stars" smallint, "total_stars" smallint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  return query
  with
    participants as (
      select
        LP.aoc_id,
        LP.name as raw_name,
        case 
          when (P.id is not null) then format('<@%s>', P.slack_id)
          else LP.name
        end as name,
        coalesce(EP.division = 'competitive', false) as is_competitive
      from
        public.leaderboard_participants as LP
        left join public.participants as P on (P.aoc_id = LP.aoc_id)
        left join public.event_participants as EP on (EP.event = LP.event) and (EP.participant_id = P.id)
      where
        1 = 1
        and (LP.event = p_event)
    ),
    raw_completions as (
      select
        C.aoc_id,
        C.day,
        coalesce(
          S.start_timestamp,
          extract ( 
            epoch from ( 
              concat(p_event, '-12-01 00:00:00-05') :: timestamptz + '1 day' :: interval * (C.day - 1) 
            ) 
          ) :: int8
        ) as start_timestamp,
        C.part_1_timestamp,
        C.part_2_timestamp,
        case
          when (C.part_2_timestamp is not null) then 2
          else 1
        end as daily_stars
      from
        public.completions as C
        left join public.participants as P on (P.aoc_id = C.aoc_id)
        left join public.start_timestamp_overrides as S on (S.participant_id = P.id) and (S.event = C.event) and (S.day = C.day)
      where
        1 = 1
        and (C.event = p_event)
    ),
    completions as (
      select
        C.aoc_id,
        C.day,
        (C.part_1_timestamp - C.start_timestamp) as part_1_duration,
        (C.part_2_timestamp - C.part_1_timestamp) as part_2_duration,
        (coalesce(C.part_2_timestamp, C.part_1_timestamp) - C.start_timestamp) as total_duration,
        C.daily_stars :: int2,
        sum(C.daily_stars) over ( partition by C.aoc_id order by C.day ) :: int2 as total_stars
      from
        raw_completions as C
    )
  select
    P.aoc_id,
    rank() over ( order by C.daily_stars desc, C.total_duration ),
    case
      when P.is_competitive then rank() over ( order by P.is_competitive desc, C.daily_stars desc, C.total_duration )
      else null
    end as competitive_rank,
    P.raw_name,
    P.name,
    P.is_competitive,
    C.part_1_duration,
    C.part_2_duration,
    C.total_duration,
    C.daily_stars,
    C.total_stars
  from
    participants as P
    join completions as C on (C.aoc_id = P.aoc_id)
  where
    1 = 1
    and (C.day = p_day :: int2)
  order by
    daily_stars desc,
    total_duration;
end;
$$;


ALTER FUNCTION "public"."get_daily_leaderboard"("p_event" "text", "p_day" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_overall_leaderboard"("p_event" "text", "p_day" "text") RETURNS TABLE("aoc_id" "text", "rank" bigint, "raw_name" "text", "name" "text", "is_competitive" boolean, "total_stars" smallint, "total_duration" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  return query
  with
    participants as (
      select
        LP.aoc_id,
        LP.name as raw_name,
        case 
          when (P.id is not null) then format('<@%s>', P.slack_id)
          else LP.name
        end as name,
        coalesce(EP.division = 'competitive', false) as is_competitive
      from
        public.leaderboard_participants as LP
        left join public.participants as P on (P.aoc_id = LP.aoc_id)
        left join public.event_participants as EP on (EP.event = LP.event) and (EP.participant_id = P.id)
      where
        1 = 1
        and (LP.event = p_event)
    ),
    raw_completions as (
      select
        C.aoc_id,
        C.day,
        coalesce(
          S.start_timestamp,
          extract ( 
            epoch from ( 
              concat(p_event, '-12-01 00:00:00-05') :: timestamptz + '1 day' :: interval * (C.day - 1) 
            ) 
          ) :: int8
        ) as start_timestamp,
        C.part_1_timestamp,
        C.part_2_timestamp,
        case
          when (C.part_2_timestamp is not null) then 2
          else 1
        end as daily_stars,
        row_number() over ( partition by C.aoc_id order by C.day desc )
      from
        public.completions as C
        left join public.participants as P on (P.aoc_id = C.aoc_id)
        left join public.start_timestamp_overrides as S on (S.participant_id = P.id) and (S.event = C.event) and (S.day = C.day)
      where
        1 = 1
        and (C.event = p_event)
        and (C.day <= p_day :: int2)
    ),
    completions as (
      select
        C.aoc_id,
        sum(coalesce(C.part_2_timestamp, C.part_1_timestamp) - C.start_timestamp) over ( partition by C.aoc_id order by C.day ) :: int8 as total_duration,
        sum(C.daily_stars) over ( partition by C.aoc_id order by C.day ) :: int2 as total_stars,
        C.row_number
      from
        raw_completions as C
    ),
    raw_leaderboard as (
      select
        P.aoc_id,
        P.raw_name,
        P.name,
        P.is_competitive,
        coalesce(C.total_stars, 0 :: int2) as total_stars,
        coalesce(C.total_duration, 0 :: int8) as total_duration
      from
        participants as P
        left join completions as C on (C.aoc_id = P.aoc_id) and (C.row_number = 1)
    )
  select
    L.aoc_id,
    rank() over ( order by L.total_stars desc, L.total_duration ),
    L.raw_name,
    L.name,
    L.is_competitive,
    L.total_stars,
    L.total_duration
  from
    raw_leaderboard L
  order by
    L.total_stars desc,
    L.total_duration,
    L.raw_name;
end;
$$;


ALTER FUNCTION "public"."get_overall_leaderboard"("p_event" "text", "p_day" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_leaderboard"("p_event" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'extensions'
    AS $$
declare
  p_leaderboard_id text;
  p_session text;
begin
  select
    decrypted_secret
  into
    p_leaderboard_id
  from
    vault.decrypted_secrets
  where
    1 = 1
    and (name = 'AOC_LEADERBOARD_ID');

  select
    decrypted_secret
  into
    p_session
  from
    vault.decrypted_secrets
  where
    1 = 1
    and (name = 'AOC_SESSION');

  -- Fetch leaderboard data.

  create temporary table source on commit drop as
  select
    content :: jsonb
  from
    http(
      (
        'GET',
        format('https://adventofcode.com/%s/leaderboard/private/view/%s.json', p_event, p_leaderboard_id),
        array[
          http_header('User-Agent', 'https://github.com/bbush915/aoc-bot by bryan@dialexa.com'),
          http_header('Cookie', format('session=%s', p_session))
        ],
        null,
        null
      )
    );

  -- Synchronize leaderboard participants.

  create temporary table aoc_leaderboard_participants on commit drop as 
  select
    p_event as event,
    M.value ->> 'id' as aoc_id,
    M.value ->> 'name' as name
  from
    source,
    jsonb_each(content -> 'members') as M;

  delete from 
    public.leaderboard_participants
  where
    1 = 1
    and (event = p_event)
    and (not exists ( select 1 from aoc_leaderboard_participants src where src.aoc_id = aoc_id ));

  merge into
    public.leaderboard_participants as dst
  using
    aoc_leaderboard_participants as src
  on
    (src.event = dst.event) and (src.aoc_id = dst.aoc_id)
  when matched then
    update 
    set name = src.name
  when not matched then
    insert ( event, aoc_id, name )
    values ( src.event, src.aoc_id, src.name );

  -- Synchronize completions.

  create temporary table aoc_completions on commit drop as
  select 
    M.value ->> 'id' as aoc_id,
    p_event as event,
    C.key :: int2 as day,
    (C.value -> '1' ->> 'get_star_ts') :: int8 as part_1_timestamp,
    (C.value -> '2' ->> 'get_star_ts') :: int8 as part_2_timestamp
  from 
    source,
    jsonb_each(content -> 'members') as M,
    jsonb_each(M.value -> 'completion_day_level') as C;

  delete from 
    public.completions
  where
    1 = 1
    and (event = p_event)
    and (not exists ( select 1 from aoc_completions src where (src.aoc_id = aoc_id) and (src.day = day) ));

  merge into
    public.completions as dst
  using
    aoc_completions as src
  on
    (src.aoc_id = dst.aoc_id) and (src.event = dst.event) and (src.day = dst.day)
  when matched then
    update 
    set 
      part_1_timestamp = src.part_1_timestamp, 
      part_2_timestamp = src.part_2_timestamp
  when not matched then
    insert ( aoc_id, event, day, part_1_timestamp, part_2_timestamp )
    values ( src.aoc_id, src.event, day, part_1_timestamp, part_2_timestamp );
end;
$$;


ALTER FUNCTION "public"."sync_leaderboard"("p_event" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."completions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aoc_id" "text" NOT NULL,
    "event" "text" NOT NULL,
    "day" smallint NOT NULL,
    "part_1_timestamp" bigint NOT NULL,
    "part_2_timestamp" bigint
);


ALTER TABLE "public"."completions" OWNER TO "postgres";


ALTER TABLE "public"."completions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."completions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."event_participants" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event" "text" NOT NULL,
    "participant_id" bigint NOT NULL,
    "division" "text" NOT NULL,
    "ai_usage" "text" NOT NULL
);


ALTER TABLE "public"."event_participants" OWNER TO "postgres";


ALTER TABLE "public"."event_participants" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."event_participants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."leaderboard_participants" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event" "text" NOT NULL,
    "aoc_id" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."leaderboard_participants" OWNER TO "postgres";


ALTER TABLE "public"."leaderboard_participants" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."leaderboard_participants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slack_id" "text" NOT NULL,
    "aoc_id" "text" NOT NULL
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


ALTER TABLE "public"."participants" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."participants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."start_timestamp_overrides" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "participant_id" bigint NOT NULL,
    "event" "text" NOT NULL,
    "day" smallint NOT NULL,
    "start_timestamp" bigint NOT NULL
);


ALTER TABLE "public"."start_timestamp_overrides" OWNER TO "postgres";


ALTER TABLE "public"."start_timestamp_overrides" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."start_timestamp_overrides_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."completions"
    ADD CONSTRAINT "completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_participant_id_key" UNIQUE ("event", "participant_id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leaderboard_participants"
    ADD CONSTRAINT "leaderboard_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_slack_id_key" UNIQUE ("slack_id");



ALTER TABLE ONLY "public"."start_timestamp_overrides"
    ADD CONSTRAINT "start_timestamp_overrides_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "participant_event_day" ON "public"."start_timestamp_overrides" USING "btree" ("participant_id", "event", "day");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."start_timestamp_overrides"
    ADD CONSTRAINT "start_timestamp_overrides_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



CREATE POLICY "Enable all for authenticated users only" ON "public"."completions" TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users only" ON "public"."event_participants" TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users only" ON "public"."leaderboard_participants" TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users only" ON "public"."participants" TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users only" ON "public"."start_timestamp_overrides" TO "authenticated" USING (true);



ALTER TABLE "public"."completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leaderboard_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."start_timestamp_overrides" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































































































































GRANT ALL ON FUNCTION "public"."get_daily_leaderboard"("p_event" "text", "p_day" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_leaderboard"("p_event" "text", "p_day" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_leaderboard"("p_event" "text", "p_day" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_overall_leaderboard"("p_event" "text", "p_day" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_overall_leaderboard"("p_event" "text", "p_day" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overall_leaderboard"("p_event" "text", "p_day" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_leaderboard"("p_event" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_leaderboard"("p_event" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_leaderboard"("p_event" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."completions" TO "anon";
GRANT ALL ON TABLE "public"."completions" TO "authenticated";
GRANT ALL ON TABLE "public"."completions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."completions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."completions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."completions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_participants" TO "anon";
GRANT ALL ON TABLE "public"."event_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."event_participants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."event_participants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."event_participants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."event_participants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."leaderboard_participants" TO "anon";
GRANT ALL ON TABLE "public"."leaderboard_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboard_participants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."leaderboard_participants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leaderboard_participants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leaderboard_participants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."participants" TO "anon";
GRANT ALL ON TABLE "public"."participants" TO "authenticated";
GRANT ALL ON TABLE "public"."participants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."participants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."participants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."participants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."start_timestamp_overrides" TO "anon";
GRANT ALL ON TABLE "public"."start_timestamp_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."start_timestamp_overrides" TO "service_role";



GRANT ALL ON SEQUENCE "public"."start_timestamp_overrides_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."start_timestamp_overrides_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."start_timestamp_overrides_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
