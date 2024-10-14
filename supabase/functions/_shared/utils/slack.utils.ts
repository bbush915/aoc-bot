import { Buffer } from "buffer";
import { createHmac, timingSafeEqual } from "crypto";

export async function handleSlackRequest(
    request: Request,
    callback: (params: URLSearchParams) => Response | Promise<Response>,
) {
    try {
        const headers = request.headers;
        const body = await request.text();

        validateSlackRequest(headers, body);

        return callback(new URLSearchParams(body));
    } catch (error) {
        console.error(error);

        return new Response("Something went wrong. Please try again later.");
    }
}

function validateSlackRequest(headers: Headers, body: string) {
    const timestamp = headers.get("x-slack-request-timestamp");
    const signature = headers.get("x-slack-signature");

    if (!timestamp || !signature) {
        throw new Error("Request is missing required headers");
    } else if (new Date().getTime() / 1000 - Number(timestamp) > 5 * 60) {
        throw new Error("Request is stale");
    }

    const hmac = createHmac("sha256", Deno.env.get("SLACK_SIGNING_SECRET")!);

    hmac.update(`v0:${timestamp}:${body}`);

    const hash = hmac.digest("hex");

    if (!timingSafeEqual(Buffer.from(`v0=${hash}`), Buffer.from(signature))) {
        throw new Error("Request has invalid signature");
    }
}

export function formatStar(dailyStars: number) {
    return dailyStars === 2 ? ":star:" : ":star-empty:";
}

export function formatTime(value: number) {
    const hours = String(Math.floor(value / (60 * 60)))
        .padStart(2, "0");

    const minutes = String(Math.floor(value / 60) % 60)
        .padStart(2, "0");

    const seconds = String(Math.floor(value) % 60)
        .padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
}
