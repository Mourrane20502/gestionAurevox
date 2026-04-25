const { verifyCaptchaToken } = require("../utils/captchaUtils");

const verifyCaptcha = async (req, res, next) => {
    const { captchaToken, captchaInput } = req.body;

    if (!captchaToken || !captchaInput) {
        return res.status(400).json({ message: "Veuillez remplir le CAPTCHA." });
    }

    const isValid = verifyCaptchaToken(captchaToken, captchaInput);

    if (!isValid) {
        return res.status(400).json({ message: "CAPTCHA invalide ou expiré." });
    }

    return next();
};

module.exports = { verifyCaptcha };

