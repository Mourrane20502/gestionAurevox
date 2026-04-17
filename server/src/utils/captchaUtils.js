const crypto = require("crypto");

const algorithm = "aes-256-cbc";
const secretKey = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || "default_secret")).digest('base64').substr(0, 32);

const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
};

const decrypt = (text) => {
    try {
        const textParts = text.split(":");
        const iv = Buffer.from(textParts.shift(), "hex");
        const encryptedText = Buffer.from(textParts.join(":"), "hex");
        const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (err) {
        return null;
    }
};

const generateCaptcha = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
    const token = encrypt(JSON.stringify({ code, expires }));
    return { token, code };
};

const verifyCaptchaToken = (token, userInput) => {
    const decrypted = decrypt(token);
    if (!decrypted) return false;

    try {
        const { code, expires } = JSON.parse(decrypted);
        if (Date.now() > expires) return false;
        const expected = String(code || "").replace(/\D/g, "");
        const provided = String(userInput || "").replace(/\D/g, "");
        if (expected.length !== 6 || provided.length !== 6) return false;
        return expected === provided;
    } catch (err) {
        return false;
    }
};

module.exports = { generateCaptcha, verifyCaptchaToken };
