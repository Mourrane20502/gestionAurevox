const db = require("../config/db");
const { scheduleAutopostJob, removeAutopostJob } = require("../services/autopostQueue");
const { getFacebookSettingsFromDb } = require("../utils/facebookSettings");

const ALLOWED_PLATFORMS = ["facebook", "instagram", "tiktok"];

const parsePlatforms = (platforms) => {
    if (!Array.isArray(platforms)) return [];
    return [...new Set(platforms.map((p) => String(p).toLowerCase()).filter((p) => ALLOWED_PLATFORMS.includes(p)))];
};

const parseRow = (row) => ({
    ...row,
    platforms: (() => {
        try {
            return JSON.parse(row.platforms_json || "[]");
        } catch {
            return [];
        }
    })(),
    platform_results: (() => {
        try {
            return row.platform_results_json ? JSON.parse(row.platform_results_json) : null;
        } catch {
            return null;
        }
    })(),
});

exports.getPlatformConfigStatus = async (_req, res) => {
    const fbDb = await getFacebookSettingsFromDb().catch(() => null);
    const facebook = {
        page_id: fbDb?.pageId || process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID || null,
        api_version: fbDb?.apiVersion || process.env.FB_API_VERSION || process.env.FACEBOOK_API_VERSION || "v20.0",
        api_url: fbDb?.apiUrl || process.env.FB_API_URL || process.env.FACEBOOK_API_URL || "https://graph.facebook.com",
        has_access_token: Boolean(fbDb?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    };

    const isReady = Boolean(facebook.page_id && facebook.has_access_token);

    res.json({
        facebook: {
            ...facebook,
            ready: isReady,
            missing: [
                !facebook.page_id ? "FB_PAGE_ID" : null,
                !facebook.has_access_token ? "FB_PAGE_ACCESS_TOKEN" : null,
            ].filter(Boolean),
        },
    });
};

exports.listAutoposts = async (_req, res) => {
    try {
        const [rows] = await db.promise().query(
            `
                SELECT *
                FROM social_autoposts
                ORDER BY scheduled_for DESC, id DESC
                LIMIT 200
            `
        );

        res.json(rows.map(parseRow));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAutopostById = async (req, res) => {
    try {
        const [[row]] = await db.promise().query(
            "SELECT * FROM social_autoposts WHERE id = ? LIMIT 1",
            [req.params.id]
        );

        if (!row) {
            return res.status(404).json({ message: "Autopost introuvable" });
        }

        res.json(parseRow(row));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createAutopost = async (req, res) => {
    try {
        const { content, media_url, scheduled_for, platforms } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ message: "Le contenu du post est obligatoire" });
        }

        if (!scheduled_for) {
            return res.status(400).json({ message: "La date de planification est obligatoire" });
        }

        const scheduledDate = new Date(scheduled_for);
        if (Number.isNaN(scheduledDate.getTime())) {
            return res.status(400).json({ message: "Date de planification invalide" });
        }

        const selectedPlatforms = parsePlatforms(platforms);
        if (selectedPlatforms.length === 0) {
            return res.status(400).json({ message: "Selectionnez au moins une plateforme" });
        }

        if ((selectedPlatforms.includes("instagram") || selectedPlatforms.includes("tiktok")) && !media_url) {
            return res.status(400).json({ message: "Instagram et TikTok requierent media_url" });
        }

        const [insertResult] = await db.promise().query(
            `
                INSERT INTO social_autoposts (
                    content,
                    media_url,
                    scheduled_for,
                    platforms_json,
                    status,
                    created_by
                ) VALUES (?, ?, ?, ?, 'scheduled', ?)
            `,
            [
                String(content).trim(),
                media_url || null,
                scheduledDate,
                JSON.stringify(selectedPlatforms),
                req.user?.id || null,
            ]
        );

        const postId = insertResult.insertId;
        const [[post]] = await db.promise().query(
            "SELECT * FROM social_autoposts WHERE id = ? LIMIT 1",
            [postId]
        );

        await scheduleAutopostJob(post);

        res.status(201).json(parseRow(post));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.cancelAutopost = async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const [[post]] = await db.promise().query(
            "SELECT * FROM social_autoposts WHERE id = ? LIMIT 1",
            [postId]
        );

        if (!post) {
            return res.status(404).json({ message: "Autopost introuvable" });
        }

        if (!["scheduled", "failed", "partial"].includes(post.status)) {
            return res.status(400).json({ message: "Cet autopost ne peut plus etre annule" });
        }

        await removeAutopostJob(postId);

        await db.promise().query(
            "UPDATE social_autoposts SET status = 'cancelled', last_error = NULL WHERE id = ?",
            [postId]
        );

        res.json({ message: "Autopost annule" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deleteAutopost = async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const [[post]] = await db.promise().query(
            "SELECT id FROM social_autoposts WHERE id = ? LIMIT 1",
            [postId]
        );

        if (!post) {
            return res.status(404).json({ message: "Autopost introuvable" });
        }

        await removeAutopostJob(postId).catch(() => null);
        await db.promise().query("DELETE FROM social_autoposts WHERE id = ?", [postId]);

        res.json({ message: "Autopost supprime" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.uploadAutopostMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Aucun fichier envoye" });
        }
        const mediaUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
        res.status(201).json({
            media_url: mediaUrl,
            filename: req.file.filename,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.aiAssistAutopost = async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL_ID || "openrouter/aurora-alpha";
    const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:4000";
    const siteName = process.env.OPENROUTER_SITE_NAME || "Aurevox Autoposting";

    if (!apiKey) {
        return res.status(500).json({ message: "OPENROUTER_API_KEY non configurée côté serveur" });
    }

    const {
        task = "caption",
        topic = "",
        tone = "professionnel",
        goal = "promotion",
        content = "",
        platforms = [],
    } = req.body || {};

    const platformList = Array.isArray(platforms) && platforms.length
        ? platforms.join(", ")
        : "facebook";

    const taskPromptMap = {
        caption: `Rédige une caption social media en français.
Sujet: ${topic || content || "nouvelle collection bijoux"}
Ton: ${tone}
Objectif: ${goal}
Plateformes: ${platformList}
Contraintes: 2 à 4 phrases, claire, engageante, sans markdown, sans emojis excessifs.`,
        hashtags: `Propose 12 hashtags pertinents en français pour ce post:
${content || topic || "nouvelle collection bijoux"}
Objectif: ${goal}
Retourne uniquement les hashtags, séparés par des espaces.`,
        variants: `Crée 3 variantes de caption en français pour:
${content || topic || "nouvelle collection bijoux"}
Ton: ${tone}
Objectif: ${goal}
Format strict:
1) ...
2) ...
3) ...`,
    };

    const prompt = taskPromptMap[task] || taskPromptMap.caption;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": siteUrl,
                "X-Title": siteName,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content: "Tu es un assistant marketing social media. Réponds en français, concis et actionnable.",
                    },
                    { role: "user", content: prompt },
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errMsg = data?.error?.message || data?.message || "Erreur OpenRouter";
            return res.status(502).json({ message: errMsg });
        }

        const answer = data?.choices?.[0]?.message?.content || "";
        return res.json({ success: true, text: String(answer).trim() });
    } catch (err) {
        return res.status(500).json({ message: err.message || "Erreur IA autoposting" });
    }
};
