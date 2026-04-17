const { getFacebookSettingsFromDb } = require("../utils/facebookSettings");
const fs = require("fs");
const path = require("path");

const parseErrorPayload = async (res) => {
    try {
        const data = await res.json();
        return data;
    } catch {
        return null;
    }
};

const getFacebookConfig = async () => {
    const fromDb = await getFacebookSettingsFromDb().catch(() => null);

    const accessToken = fromDb?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const pageId = fromDb?.pageId || process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID;
    const apiVersion = fromDb?.apiVersion || process.env.FB_API_VERSION || process.env.FACEBOOK_API_VERSION || "v20.0";
    const apiUrl = (fromDb?.apiUrl || process.env.FB_API_URL || process.env.FACEBOOK_API_URL || "https://graph.facebook.com").replace(/\/+$/, "");

    return { accessToken, pageId, apiVersion, apiUrl };
};

const toPublicMediaUrl = (rawUrl) => {
    if (!rawUrl) return rawUrl;
    const mediaUrl = String(rawUrl).trim();
    if (!mediaUrl) return mediaUrl;

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    const localHostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

    // Relative path case: "/uploads/xyz.jpg"
    if (mediaUrl.startsWith("/")) {
        if (!publicBaseUrl) return mediaUrl;
        return `${publicBaseUrl}${mediaUrl}`;
    }

    // Localhost absolute URL case
    if (localHostPattern.test(mediaUrl) && publicBaseUrl) {
        return mediaUrl.replace(localHostPattern, publicBaseUrl);
    }

    return mediaUrl;
};

const resolveLocalUploadPath = (rawUrl) => {
    if (!rawUrl) return null;
    try {
        const mediaUrl = String(rawUrl).trim();
        let pathname = null;

        if (mediaUrl.startsWith("/uploads/")) {
            pathname = mediaUrl;
        } else if (/^https?:\/\//i.test(mediaUrl)) {
            const parsed = new URL(mediaUrl);
            pathname = parsed.pathname;
        } else {
            return null;
        }

        if (!pathname || !pathname.startsWith("/uploads/")) return null;
        const filename = path.basename(pathname);
        if (!filename) return null;

        return path.join(__dirname, "../../uploads", filename);
    } catch {
        return null;
    }
};

const publishToFacebook = async ({ content, mediaUrl }) => {
    const { accessToken, pageId, apiVersion, apiUrl } = await getFacebookConfig();

    if (!accessToken || !pageId) {
        throw new Error("Configuration Facebook manquante: FB_PAGE_ACCESS_TOKEN / FB_PAGE_ID");
    }

    const isMediaPost = Boolean(mediaUrl);
    const endpoint = isMediaPost
        ? `${apiUrl}/${apiVersion}/${pageId}/photos`
        : `${apiUrl}/${apiVersion}/${pageId}/feed`;
    const finalMediaUrl = toPublicMediaUrl(mediaUrl);
    const localUploadPath = resolveLocalUploadPath(mediaUrl);
    const localFileExists = localUploadPath ? fs.existsSync(localUploadPath) : false;

    let body;
    if (isMediaPost && localFileExists) {
        // Send local uploads as multipart binary, avoids external URL accessibility issues.
        const fileBuffer = await fs.promises.readFile(localUploadPath);
        const formData = new FormData();
        formData.set("access_token", accessToken);
        formData.set("caption", content);
        formData.set("source", new Blob([fileBuffer]), path.basename(localUploadPath));
        body = formData;
    } else {
        const params = new URLSearchParams();
        params.set("access_token", accessToken);
        if (finalMediaUrl) {
            params.set("url", finalMediaUrl);
            params.set("caption", content);
        } else {
            params.set("message", content);
        }
        body = params;
    }

    const res = await fetch(endpoint, {
        method: "POST",
        body,
    });

    const data = await parseErrorPayload(res);
    if (!res.ok || data?.error) {
        console.error("[Facebook Publish Error]", {
            endpoint,
            pageId,
            mediaUrl: finalMediaUrl || null,
            usedLocalFileUpload: Boolean(isMediaPost && localFileExists),
            status: res.status,
            statusText: res.statusText,
            error: data?.error || data || null,
        });
        throw new Error(data?.error?.message || "Echec publication Facebook");
    }

    return {
        externalId: data?.post_id || data?.id || null,
        raw: data,
    };
};

const publishToInstagram = async ({ content, mediaUrl }) => {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    if (!accessToken || !businessAccountId) {
        throw new Error("Configuration Instagram manquante: INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID");
    }

    if (!mediaUrl) {
        throw new Error("Instagram requiert media_url (image/video)");
    }

    const finalMediaUrl = toPublicMediaUrl(mediaUrl);
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(finalMediaUrl);

    const createBody = new URLSearchParams();
    createBody.set(isVideo ? "video_url" : "image_url", finalMediaUrl);
    createBody.set("caption", content);
    createBody.set("access_token", accessToken);

    const createRes = await fetch(`https://graph.facebook.com/v20.0/${businessAccountId}/media`, {
        method: "POST",
        body: createBody,
    });

    const createData = await parseErrorPayload(createRes);
    if (!createRes.ok || createData?.error || !createData?.id) {
        throw new Error(createData?.error?.message || "Echec creation media Instagram");
    }

    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", createData.id);
    publishBody.set("access_token", accessToken);

    const publishRes = await fetch(`https://graph.facebook.com/v20.0/${businessAccountId}/media_publish`, {
        method: "POST",
        body: publishBody,
    });

    const publishData = await parseErrorPayload(publishRes);
    if (!publishRes.ok || publishData?.error) {
        throw new Error(publishData?.error?.message || "Echec publication Instagram");
    }

    return {
        externalId: publishData?.id || createData.id,
        raw: { createData, publishData },
    };
};

const publishToTikTok = async ({ content, mediaUrl }) => {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error("Configuration TikTok manquante: TIKTOK_ACCESS_TOKEN");
    }

    if (!mediaUrl) {
        throw new Error("TikTok requiert media_url (video)");
    }
    const finalMediaUrl = toPublicMediaUrl(mediaUrl);

    const payload = {
        post_info: {
            title: (content || "").slice(0, 150),
            privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
        },
        source_info: {
            source: "PULL_FROM_URL",
            video_url: finalMediaUrl,
        },
    };

    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await parseErrorPayload(res);
    if (!res.ok || data?.error) {
        throw new Error(data?.error?.message || data?.error?.code || "Echec publication TikTok");
    }

    return {
        externalId: data?.data?.publish_id || null,
        raw: data,
    };
};

const publishToPlatform = async (platform, payload) => {
    switch (platform) {
        case "facebook":
            return publishToFacebook(payload);
        case "instagram":
            return publishToInstagram(payload);
        case "tiktok":
            return publishToTikTok(payload);
        default:
            throw new Error(`Plateforme non supportee: ${platform}`);
    }
};

module.exports = {
    publishToPlatform,
};
