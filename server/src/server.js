const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173","https://epic-lamport.51-83-71-140.plesk.page" ,"addahab.org"],
        credentials: true
    }
});

const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
dotenv.config();

// Derrière nginx/Caddy/Apache : activer TRUST_PROXY=1 pour que req.ip et la géoloc
// utilisent X-Forwarded-For / X-Real-IP (sinon tout semble venir de 127.0.0.1 → « Localhost »).
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "1" || trustProxy === "true") {
    app.set("trust proxy", 1);
} else if (trustProxy && !Number.isNaN(Number(trustProxy))) {
    app.set("trust proxy", Number(trustProxy));
}

// Make io accessible in req
app.set("io", io);

app.use(cors({
    origin: ["http://localhost:5173","https://epic-lamport.51-83-71-140.plesk.page" ,"addahab.org"],
    credentials: true
}))

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));



const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const pdvRoutes = require("./routes/pdvRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const devisRoutes = require("./routes/devisRoutes");
const devisGrosRoutes = require("./routes/devisGrosRoutes");
const commandeGrosRoutes = require("./routes/commandeGrosRoutes");
const factureGrosRoutes = require("./routes/factureGrosRoutes");
const clientsRoutes = require("./routes/clientsRoutes");
const employeesRoutes = require("./routes/employeesRoutes");
const congeRoutes = require("./routes/congeRoutes");
const salaryRoutes = require("./routes/salaryRoutes");
const paieRoutes = require("./routes/paieRoutes");
const pointageRoutes = require("./routes/pointageRoutes");
const commandeRoutes = require("./routes/commandeRoutes");
const factureRoutes = require("./routes/factureRoutes");
const aiRoutes = require("./routes/aiRoutes");
const fournisseursRoutes = require("./routes/fournisseursRoutes");
const achatsFournisseurRoutes = require("./routes/achatFournisseurRoutes");
const produitsFournisseurRoutes = require("./routes/produitsFournisseurRoutes");
const gestionnaireRoutes = require("./routes/gestionnaireRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const avoirRoutes = require("./routes/avoirRoutes");
const avoirGrosRoutes = require("./routes/avoirGrosRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const rolePermissionRoutes = require("./routes/rolePermissionRoutes");
const banqueRoutes = require("./routes/banqueRoutes");
const caisseRoutes = require("./routes/caisseRoutes");
const productMovementRoutes = require("./routes/productMovementRoutes");
const inventoryVerificationRoutes = require("./routes/inventoryVerificationRoutes");
const reglementFournisseurRoutes = require("./routes/reglementFournisseurRoutes");
const reglementClientRoutes = require("./routes/reglementClientRoutes");
const reglementClientGrosRoutes = require("./routes/reglementClientGrosRoutes");
const bilanRoutes = require("./routes/bilanRoutes");
const loginLogRoutes = require("./routes/loginLogRoutes");
const promotionsRoutes = require("./routes/promotionsRoutes");
const remboursementRoutes = require("./routes/remboursementRoutes");
const productTypesRoutes = require("./routes/productTypesRoutes");
const autopostRoutes = require("./routes/autopostRoutes");
const bonLivraisonRoutes = require("./routes/bonLivraisonRoutes");
const margeRoutes = require("./routes/margeRoutes");
const { ensurePromotionsTable } = require("./utils/promotionUtils");
const { ensureAutopostsTable } = require("./utils/autopostUtils");
const { bootstrapScheduledAutoposts } = require("./services/autopostQueue");
const { bootstrapFournisseurFiscalReminders } = require("./services/fournisseurFiscalReminderService");

const PORT = process.env.PORT || 3000;

const db = require("./config/db");
const authorize = require("./middleware/authorizeMiddleware");
const authenticate = require("./middleware/authMiddleware");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pdv", pdvRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/devis", devisRoutes);
app.use("/api/devis-gros", devisGrosRoutes);
app.use("/api/commandes-gros", commandeGrosRoutes);
app.use("/api/factures-gros", factureGrosRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/conges", congeRoutes);
app.use("/api/salaries", salaryRoutes);
app.use("/api/paie", paieRoutes);
app.use("/api/pointage", pointageRoutes);
app.use("/api/commandes", commandeRoutes);
app.use("/api/factures", factureRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/fournisseurs", fournisseursRoutes);
app.use("/api/achats-fournisseurs", achatsFournisseurRoutes);
app.use("/api/produits-fournisseurs", produitsFournisseurRoutes);
app.use("/api/gestionnaires", gestionnaireRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/avoirs", avoirRoutes);
app.use("/api/avoirs-gros", avoirGrosRoutes);
app.use("/api/remboursements", remboursementRoutes);
app.use("/api/settings", authenticate, settingsRoutes);
app.use("/api/role-permissions", rolePermissionRoutes);
app.use("/api/banque", banqueRoutes);
app.use("/api/caisse", caisseRoutes);
app.use("/api/product-movements", productMovementRoutes);
app.use("/api/inventory-verifications", inventoryVerificationRoutes);
app.use("/api/reglements-fournisseurs", reglementFournisseurRoutes);
app.use("/api/reglements-clients", reglementClientRoutes);
app.use("/api/reglements-clients-gros", reglementClientGrosRoutes);
app.use("/api/bilan", bilanRoutes);
app.use("/api/login-logs", loginLogRoutes);
app.use("/api/promotions", promotionsRoutes);
app.use("/api/product-types", productTypesRoutes);
app.use("/api/autoposts", autopostRoutes);
app.use("/api/bons-livraison", bonLivraisonRoutes);
app.use("/api/marge", margeRoutes);

app.get("/profile", authenticate, authorize("user"), (req, res) => {
    res.json({ message: "profile" })
})

app.get("/dashboard", authenticate, authorize("admin"), (req, res) => {
    res.json({ message: "dashboard" })
})

app.get("/users", async (req, res) => {
    const query = "SELECT * FROM users";
    db.query(query, (err, result) => {
        if (err) throw err;
        res.json(result);
    })

})

db.promise().getConnection()
    .then(connection => {
        console.log("Database connected successfully to pool");
        connection.release();
    })
    .catch(err => {
        console.error("Database connection failed:", err.message);
    });

ensurePromotionsTable();
ensureAutopostsTable();
bootstrapScheduledAutoposts();
bootstrapFournisseurFiscalReminders();


server.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
});