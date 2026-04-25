const db = require("../config/db");

exports.getAllPromotions = async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT p.*, pr.nom as product_name, pr.reference as product_ref 
            FROM promotions p
            LEFT JOIN products pr ON p.product_id = pr.id
            ORDER BY p.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createPromotion = async (req, res) => {
    const { product_id, label, description, discount_percent, start_date, end_date } = req.body;
    try {
        const [result] = await db.promise().query(
            "INSERT INTO promotions (product_id, label, description, discount_percent, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
            [product_id, label, description, discount_percent, start_date, end_date]
        );
        res.status(201).json({ id: result.insertId, message: "Promotion créée" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updatePromotion = async (req, res) => {
    const { id } = req.params;
    const { product_id, label, description, discount_percent, start_date, end_date, is_active } = req.body;
    try {
        await db.promise().query(
            "UPDATE promotions SET product_id=?, label=?, description=?, discount_percent=?, start_date=?, end_date=?, is_active=? WHERE id=?",
            [product_id, label, description, discount_percent, start_date, end_date, is_active, id]
        );
        res.json({ message: "Promotion mise à jour" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deletePromotion = async (req, res) => {
    const { id } = req.params;
    try {
        await db.promise().query("DELETE FROM promotions WHERE id=?", [id]);
        res.json({ message: "Promotion supprimée" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.sendNotification = async (req, res) => {
    const { promotion_id, client_ids, message_template, channel } = req.body;
    // channel can be 'whatsapp' or 'sms'
    
    try {
        // Fetch promotion, clients and related product details
        const [[promotion]] = await db.promise().query(`
            SELECT p.*, pr.nom as product_name, pr.prix as product_price 
            FROM promotions p
            LEFT JOIN products pr ON p.product_id = pr.id
            WHERE p.id = ?
        `, [promotion_id]);
        if (!promotion) return res.status(404).json({ message: "Promotion non trouvée" });

        const [clients] = await db.promise().query("SELECT * FROM clients WHERE id IN (?)", [client_ids]);
        
        // Calculate prices if a specific product is linked
        let oldPrice = "";
        let newPrice = "";
        if (promotion.product_price != null) {
            oldPrice = parseFloat(promotion.product_price).toFixed(2);
            newPrice = (parseFloat(promotion.product_price) * (1 - promotion.discount_percent / 100)).toFixed(2);
        }
        
        // Logic to "send" would be here. For now, we return the generated messages/links
        const results = clients.map(client => {
            let msg = message_template
                .replace(/{client_name}/g, client.nom_complet || "")
                .replace(/{promo_label}/g, promotion.label || "")
                .replace(/{discount}/g, promotion.discount_percent + "%")
                .replace(/{product_name}/g, promotion.product_name || "nos produits")
                .replace(/{old_price}/g, oldPrice ? oldPrice + " DH" : "")
                .replace(/{new_price}/g, newPrice ? newPrice + " DH" : "");
            
            let link = "";
            if (channel === 'whatsapp' && client.telephone) {
                // Remove non-digits from phone
                let phone = client.telephone.replace(/\D/g, '');
                
                // Format for Morocco (international format without +)
                // If it starts with 0 (e.g., 06xxxxxxxx), replace 0 with 212
                if (phone.startsWith('0') && phone.length >= 10) {
                    phone = '212' + phone.substring(1);
                } else if (phone.length === 9) {
                    // If it's just 9 digits like 6xxxxxxxx, add 212
                    phone = '212' + phone;
                }
                
                link = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
            }
            
            return {
                client_id: client.id,
                client_name: client.nom_complet,
                phone: client.telephone,
                message: msg,
                link: link
            };
        });

        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
