const db = require("../config/db");
const { publishToPlatform } = require("./platformPublishers");

const POLL_INTERVAL_MS = Number(process.env.AUTOPOST_POLL_INTERVAL_MS || 10000);
const BATCH_SIZE = Number(process.env.AUTOPOST_BATCH_SIZE || 20);
let pollTimer = null;
let isPolling = false;

const safeParse = (value, fallback) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const processAutopostJob = async (postId) => {
    const [[post]] = await db.promise().query(
        "SELECT * FROM social_autoposts WHERE id = ? LIMIT 1",
        [postId]
    );

    if (!post) return;
    if (!["scheduled", "processing"].includes(post.status)) return;

    const [lockResult] = await db.promise().query(
        `
            UPDATE social_autoposts
            SET status = 'processing', last_error = NULL
            WHERE id = ?
              AND status = 'scheduled'
              AND scheduled_for <= NOW()
        `,
        [postId]
    );
    if (lockResult.affectedRows === 0 && post.status !== "processing") return;

    const platforms = safeParse(post.platforms_json, []);
    const results = {};
    let successCount = 0;

    for (const platform of platforms) {
        try {
            const published = await publishToPlatform(platform, {
                content: post.content,
                mediaUrl: post.media_url,
            });

            results[platform] = {
                success: true,
                external_id: published.externalId,
                raw: published.raw,
            };
            successCount += 1;
        } catch (error) {
            console.error("[Autopost Platform Error]", {
                postId,
                platform,
                message: error?.message || "Unknown error",
                stack: error?.stack || null,
            });
            results[platform] = {
                success: false,
                error: error.message,
            };
        }
    }

    const finalStatus =
        successCount === platforms.length
            ? "published"
            : successCount > 0
                ? "partial"
                : "failed";

    const errorMessages = Object.entries(results)
        .filter(([, value]) => !value.success)
        .map(([platform, value]) => `${platform}: ${value.error}`)
        .join(" | ");

    await db.promise().query(
        `
            UPDATE social_autoposts
            SET status = ?,
                published_at = ?,
                platform_results_json = ?,
                last_error = ?,
                job_id = NULL
            WHERE id = ?
        `,
        [
            finalStatus,
            successCount > 0 ? new Date() : null,
            JSON.stringify(results),
            errorMessages || null,
            postId,
        ]
    );
};

const processDueAutoposts = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
        const [rows] = await db.promise().query(
            `
                SELECT id
                FROM social_autoposts
                WHERE status = 'scheduled'
                  AND scheduled_for <= NOW()
                ORDER BY scheduled_for ASC, id ASC
                LIMIT ?
            `,
            [BATCH_SIZE]
        );

        for (const row of rows) {
            try {
                await processAutopostJob(row.id);
            } catch (err) {
                console.error(`Autopost job failed [${row.id}]:`, err?.message || err);
            }
        }
    } catch (err) {
        console.error("Autopost poller error:", err?.message || err);
    } finally {
        isPolling = false;
    }
};

const scheduleAutopostJob = async (post) => {
    // MySQL mode: no external queue, DB row itself is the schedule source.
    // Keep job_id for backward compatibility with existing schema/API.
    await db.promise().query(
        "UPDATE social_autoposts SET job_id = ? WHERE id = ?",
        [`mysql:${post.id}`, post.id]
    );

    // Trigger near-immediate processing when scheduled time is now/past.
    if (new Date(post.scheduled_for).getTime() <= Date.now()) {
        setTimeout(() => {
            processAutopostJob(post.id).catch((err) => {
                console.error(`Immediate autopost processing failed [${post.id}]:`, err?.message || err);
            });
        }, 0);
    }

    return { id: `mysql:${post.id}` };
};

const removeAutopostJob = async (postId) => {
    await db.promise().query("UPDATE social_autoposts SET job_id = NULL WHERE id = ?", [postId]);
};

const bootstrapScheduledAutoposts = async () => {
    try {
        if (pollTimer) {
            clearInterval(pollTimer);
        }
        await processDueAutoposts();
        pollTimer = setInterval(processDueAutoposts, POLL_INTERVAL_MS);
    } catch (err) {
        console.error("Failed to bootstrap scheduled autoposts:", err.message);
    }
};

module.exports = {
    autopostQueue: null,
    scheduleAutopostJob,
    removeAutopostJob,
    bootstrapScheduledAutoposts,
};
