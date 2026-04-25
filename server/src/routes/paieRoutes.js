const express = require("express");
const router = express.Router();
const { getVolumeVente } = require("../controllers/paieController");
const authenticate = require("../middleware/authMiddleware");
const authorizePermission = require("../middleware/authorizePermission");

router.get("/volume-vente", authenticate, authorizePermission("paie_view"), getVolumeVente);

module.exports = router;
