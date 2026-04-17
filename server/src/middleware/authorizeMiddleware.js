const authorize = (...roles) => {
    return (req, res, next) => {
        const userRole = (req.user && req.user.role || "").toString().toLowerCase();
        const allowed = roles.some((r) => String(r).toLowerCase() === userRole);
        if (!allowed) {
            return res.status(403).json({ message: "Access denied" });
        }
        next();
    };
};

module.exports = authorize;
