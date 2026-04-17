const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateCaptcha } = require("../utils/captchaUtils");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

exports.getCaptcha = (req, res) => {
    const { token, code } = generateCaptcha();
    res.json({ captchaToken: token, captchaCode: code });
};

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

let twoFaSchemaReady = false;
const ensureTwoFaColumns = async () => {
    if (twoFaSchemaReady) return;
    const conn = db.promise();
    const [cols] = await conn.query("SHOW COLUMNS FROM users");
    const existing = new Set((cols || []).map((c) => String(c.Field || "").toLowerCase()));
    const alters = [];
    if (!existing.has("twofa_enabled")) {
        alters.push("ALTER TABLE users ADD COLUMN twofa_enabled TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existing.has("twofa_secret")) {
        alters.push("ALTER TABLE users ADD COLUMN twofa_secret VARCHAR(255) NULL");
    }
    if (!existing.has("twofa_temp_secret")) {
        alters.push("ALTER TABLE users ADD COLUMN twofa_temp_secret VARCHAR(255) NULL");
    }
    if (!existing.has("twofa_enabled_at")) {
        alters.push("ALTER TABLE users ADD COLUMN twofa_enabled_at DATETIME NULL");
    }
    for (const sql of alters) {
        await conn.query(sql);
    }
    twoFaSchemaReady = true;
};

const getEffectiveRole = (role) => (role === "commercial" ? "user" : role);

const signAccessToken = (user) =>
    jwt.sign(
        {
            id: user.id,
            role: getEffectiveRole(user.role),
            nom: user.nom,
            prenom: user.prenom,
        },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
    );

const signTwoFaTempToken = (user) =>
    jwt.sign(
        {
            type: "2fa_login",
            id: user.id,
            role: getEffectiveRole(user.role),
        },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
    );

const isPrivateOrLoopbackIpv4 = (ip) => {
    if (!ip || ip === "::1") return true;
    if (/^127\./.test(ip)) return true;
    if (/^10\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    return false;
};

/** IP client réelle derrière proxy (Cloudflare, nginx, etc.). */
const getClientIp = (req) => {
    const h = req.headers;
    const cf = h["cf-connecting-ip"];
    if (cf) return String(cf).trim();

    const real = h["x-real-ip"];
    if (real) return String(real).split(",")[0].trim();

    const xff = h["x-forwarded-for"];
    if (xff) {
        const parts = String(xff)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        for (const p of parts) {
            let v4 = p.startsWith("::ffff:") ? p.slice(7) : p;
            if (!isPrivateOrLoopbackIpv4(v4) && v4 !== "::1") {
                return v4;
            }
        }
        if (parts.length) {
            let first = parts[0];
            if (first.startsWith("::ffff:")) first = first.slice(7);
            return first;
        }
    }

    let ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "0.0.0.0";
    if (typeof ip === "string" && ip.startsWith("::ffff:")) ip = ip.slice(7);
    return ip;
};

const getIPAndLocation = async (req) => {
    let ip = getClientIp(req);
    if (ip.includes(",")) ip = ip.split(",")[0].trim();

    if (ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "127.0.0.1") {
        return { ip: "127.0.0.1", location: "Localhost" };
    }
    if (isPrivateOrLoopbackIpv4(ip)) {
        return { ip, location: "Réseau local" };
    }

    if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");

    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,query`);
        const data = await response.json();
        if (data.status === "success") {
            return { ip: data.query, location: `${data.city}, ${data.country}` };
        }
    } catch (e) {
        console.error("GeoIP error:", e);
    }
    return { ip, location: "Inconnue" };
};



exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    try {
        await ensureTwoFaColumns();
    } catch (e) {
        console.error("2FA schema ensure failed:", e);
        return res.status(500).json({ message: "Internal server error" });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, result) => {
        if (err) {
            console.log("Login error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }

        if (result.length === 0) {
            // Log failed attempt
            try {
                const { ip, location } = await getIPAndLocation(req);
                db.query(
                    "INSERT INTO login_logs (email, ip_address, location, user_agent, status) VALUES (?, ?, ?, ?, ?)",
                    [
                        email,
                        ip,
                        location,
                        req.headers["user-agent"] || null,
                        "failed"
                    ]
                );
            } catch (e) {
                console.error("Failed to log login attempt:", e);
            }
            return res.status(400).json({ message: "Mot de passe ou email incorrect" });
        }

        const user = result[0];

        const effectiveRole = getEffectiveRole(user.role);

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            // Log failed attempt
            try {
                const { ip, location } = await getIPAndLocation(req);
                db.query(
                    "INSERT INTO login_logs (user_id, email, user_nom, user_prenom, ip_address, location, user_agent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        user.id,
                        user.email,
                        user.nom,
                        user.prenom,
                        ip,
                        location,
                        req.headers["user-agent"] || null,
                        "failed"
                    ]
                );
            } catch (e) {
                console.error("Failed to log login attempt:", e);
            }
            return res.status(400).json({ message: "Mot de passe ou email incorrect" });
        }

        const twoFaEnabled = Number(user.twofa_enabled || 0) === 1 && Boolean(user.twofa_secret);
        if (twoFaEnabled) {
            return res.status(200).json({
                message: "2FA required",
                requiresTwoFactor: true,
                tempToken: signTwoFaTempToken(user),
            });
        }

        const token = signAccessToken(user);

        // Fetch permissions for the role
        const permQuery = `
            SELECT p.name 
            FROM permissions p 
            JOIN role_permissions rp ON p.id = rp.permission_id 
            JOIN roles r ON r.id = rp.role_id 
            WHERE r.name = ?
        `;

        db.query(permQuery, [effectiveRole], (permErr, permResult) => {
            const permissions = permResult ? permResult.map(p => p.name) : [];

            // Log successful attempt
            try {
                getIPAndLocation(req).then(({ ip, location }) => {
                    db.query(
                        "INSERT INTO login_logs (user_id, email, user_nom, user_prenom, ip_address, location, user_agent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            user.id,
                            user.email,
                            user.nom,
                            user.prenom,
                            ip,
                            location,
                            req.headers["user-agent"] || null,
                            "success"
                        ]
                    );
                }).catch(e => console.error("Async log error:", e));
            } catch (e) {
                console.error("Failed to log login attempt:", e);
            }

            return res.status(200).json({
                message: "Login successful",
                token,
                role: effectiveRole,
                permissions: permissions
            });
        });
    });
};

exports.verifyTwoFactorLogin = async (req, res) => {
    const { tempToken, code } = req.body || {};
    if (!tempToken || !code) {
        return res.status(400).json({ message: "Code 2FA requis." });
    }
    try {
        await ensureTwoFaColumns();
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        if (!decoded || decoded.type !== "2fa_login" || !decoded.id) {
            return res.status(401).json({ message: "Session 2FA invalide." });
        }

        const [rows] = await db.promise().query("SELECT * FROM users WHERE id = ? LIMIT 1", [decoded.id]);
        const user = rows?.[0];
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
        if (!(Number(user.twofa_enabled || 0) === 1 && user.twofa_secret)) {
            return res.status(400).json({ message: "2FA non activée pour ce compte." });
        }

        const ok = speakeasy.totp.verify({
            secret: user.twofa_secret,
            encoding: "base32",
            token: String(code).replace(/\s/g, ""),
            window: 1,
        });
        if (!ok) {
            return res.status(400).json({ message: "Code 2FA invalide." });
        }

        const token = signAccessToken(user);
        const permissions = await new Promise((resolve) => {
            const permQuery = `
                SELECT p.name
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id
                JOIN roles r ON r.id = rp.role_id
                WHERE r.name = ?
            `;
            db.query(permQuery, [getEffectiveRole(user.role)], (_err, result) => {
                resolve(result ? result.map((p) => p.name) : []);
            });
        });

        return res.status(200).json({
            message: "Login successful",
            token,
            role: getEffectiveRole(user.role),
            permissions,
        });
    } catch (err) {
        if (err?.name === "TokenExpiredError" || err?.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Session 2FA expirée. Reconnectez-vous." });
        }
        console.error("2FA login verification error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getTwoFactorStatus = async (req, res) => {
    try {
        await ensureTwoFaColumns();
        const [rows] = await db.promise().query(
            "SELECT twofa_enabled, twofa_enabled_at FROM users WHERE id = ? LIMIT 1",
            [req.user.id]
        );
        const user = rows?.[0];
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
        return res.status(200).json({
            enabled: Number(user.twofa_enabled || 0) === 1,
            enabled_at: user.twofa_enabled_at || null,
        });
    } catch (err) {
        console.error("2FA status error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.startTwoFactorSetup = async (req, res) => {
    try {
        await ensureTwoFaColumns();
        const [rows] = await db.promise().query("SELECT email, twofa_enabled FROM users WHERE id = ? LIMIT 1", [req.user.id]);
        const user = rows?.[0];
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

        const appName = process.env.APP_NAME || "Bijouterie";
        const secret = speakeasy.generateSecret({
            name: `${appName} (${user.email})`,
            issuer: appName,
            length: 20,
        });
        await db.promise().query(
            "UPDATE users SET twofa_temp_secret = ? WHERE id = ?",
            [secret.base32, req.user.id]
        );
        const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
        return res.status(200).json({
            message: "2FA setup started",
            secret: secret.base32,
            otpauth_url: secret.otpauth_url,
            qrCodeDataUrl,
            alreadyEnabled: Number(user.twofa_enabled || 0) === 1,
        });
    } catch (err) {
        console.error("2FA setup start error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.enableTwoFactor = async (req, res) => {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "Code 2FA requis." });
    try {
        await ensureTwoFaColumns();
        const [rows] = await db.promise().query(
            "SELECT twofa_temp_secret FROM users WHERE id = ? LIMIT 1",
            [req.user.id]
        );
        const user = rows?.[0];
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
        if (!user.twofa_temp_secret) {
            return res.status(400).json({ message: "Aucune configuration 2FA en cours. Lancez la configuration." });
        }

        const ok = speakeasy.totp.verify({
            secret: user.twofa_temp_secret,
            encoding: "base32",
            token: String(code).replace(/\s/g, ""),
            window: 1,
        });
        if (!ok) return res.status(400).json({ message: "Code 2FA invalide." });

        await db.promise().query(
            "UPDATE users SET twofa_secret = ?, twofa_temp_secret = NULL, twofa_enabled = 1, twofa_enabled_at = NOW() WHERE id = ?",
            [user.twofa_temp_secret, req.user.id]
        );
        return res.status(200).json({ message: "2FA activée avec succès.", enabled: true });
    } catch (err) {
        console.error("2FA enable error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.disableTwoFactor = async (req, res) => {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "Code 2FA requis pour désactiver." });
    try {
        await ensureTwoFaColumns();
        const [rows] = await db.promise().query(
            "SELECT twofa_enabled, twofa_secret FROM users WHERE id = ? LIMIT 1",
            [req.user.id]
        );
        const user = rows?.[0];
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
        if (!(Number(user.twofa_enabled || 0) === 1 && user.twofa_secret)) {
            return res.status(400).json({ message: "2FA déjà désactivée." });
        }

        const ok = speakeasy.totp.verify({
            secret: user.twofa_secret,
            encoding: "base32",
            token: String(code).replace(/\s/g, ""),
            window: 1,
        });
        if (!ok) return res.status(400).json({ message: "Code 2FA invalide." });

        await db.promise().query(
            "UPDATE users SET twofa_enabled = 0, twofa_secret = NULL, twofa_temp_secret = NULL, twofa_enabled_at = NULL WHERE id = ?",
            [req.user.id]
        );
        return res.status(200).json({ message: "2FA désactivée.", enabled: false });
    } catch (err) {
        console.error("2FA disable error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.verify = (req, res) => {
    // Same backward-compatibility mapping as in login:
    // normalize any "commercial" role back to "user" for permissions.
    const effectiveRole = req.user.role === "commercial" ? "user" : req.user.role;

    const permQuery = `
        SELECT p.name 
        FROM permissions p 
        JOIN role_permissions rp ON p.id = rp.permission_id 
        JOIN roles r ON r.id = rp.role_id 
        WHERE r.name = ?
    `;

    db.query(permQuery, [effectiveRole], (permErr, permResult) => {
        const permissions = permResult ? permResult.map(p => p.name) : [];
        res.status(200).json({
            message: "Token is valid",
            user: {
                ...req.user,
                role: effectiveRole,
            },
            permissions: permissions
        });
    });
};
