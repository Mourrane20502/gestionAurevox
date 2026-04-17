/**
 * Insère ou met à jour les tarifs métaux (clé `metal_pricing` dans `general_settings`).
 *
 * Usage (depuis le dossier server/) :
 *   node src/scripts/seed_metal_pricing.js
 *   node src/scripts/seed_metal_pricing.js '{"defaultMetal":"or","priceOrResign":"120","priceOrRafinity":"115"}'
 *
 * Sans argument : utilise SEED ci-dessous (modifiez les valeurs DH/g selon votre bijouterie).
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const { mergeMetalPricing, getMetalPricing } = require("../utils/metalPricingSettings");

/** Valeurs par défaut écrites en base — à adapter avant d’exécuter le script. */
const SEED = {
    defaultMetal: "or",
    priceOrResign: "",
    priceOrRafinity: "",
    priceOrBeldi: "",
    priceOrOccasion: "",
    priceSilverBeldy: "",
    priceSilverRafinity: "",
};

async function main() {
    if (!process.env.DB_NAME) {
        console.error("DB_NAME manquant : vérifiez server/.env");
        process.exit(1);
    }

    let patch = { ...SEED };
    const arg = process.argv[2];
    if (arg) {
        try {
            const parsed = JSON.parse(arg);
            if (typeof parsed !== "object" || parsed === null) {
                throw new Error("Le JSON doit être un objet");
            }
            patch = { ...SEED, ...parsed };
        } catch (e) {
            console.error("Argument JSON invalide :", e.message);
            console.error('Exemple : node src/scripts/seed_metal_pricing.js \'{"priceOrResign":"100"}\'');
            process.exit(1);
        }
    }

    try {
        const before = await getMetalPricing();
        console.log("Avant :", JSON.stringify(before, null, 2));

        const merged = await mergeMetalPricing(patch);
        console.log("Après fusion :", JSON.stringify(merged, null, 2));
        console.log("OK — tarifs métaux enregistrés (general_settings.metal_pricing).");
        process.exit(0);
    } catch (err) {
        console.error("Erreur seed_metal_pricing :", err);
        process.exit(1);
    }
}

main();
