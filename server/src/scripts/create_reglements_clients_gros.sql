CREATE TABLE IF NOT EXISTS reglements_clients_gros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_recu INT NULL UNIQUE,
    client_id INT NOT NULL,
    facture_gros_id INT NULL,
    commande_gros_id INT NULL,
    date_reglement DATETIME NOT NULL,
    montant DECIMAL(15,2) NOT NULL,
    mode_paiement VARCHAR(50) NOT NULL,
    banque_id INT NULL,
    statut VARCHAR(50) NOT NULL DEFAULT 'en_attente',
    commentaire TEXT NULL,
    created_by INT NOT NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_regl_cli_gros_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_regl_cli_gros_facture FOREIGN KEY (facture_gros_id) REFERENCES factures_gros(id) ON DELETE SET NULL,
    CONSTRAINT fk_regl_cli_gros_commande FOREIGN KEY (commande_gros_id) REFERENCES commandes_gros(id) ON DELETE SET NULL,
    CONSTRAINT fk_regl_cli_gros_banque FOREIGN KEY (banque_id) REFERENCES banques(id) ON DELETE SET NULL,
    CONSTRAINT fk_regl_cli_gros_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_regl_cli_gros_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_regl_cli_gros_client ON reglements_clients_gros (client_id);
CREATE INDEX idx_regl_cli_gros_facture ON reglements_clients_gros (facture_gros_id);
CREATE INDEX idx_regl_cli_gros_commande ON reglements_clients_gros (commande_gros_id);
CREATE INDEX idx_regl_cli_gros_statut ON reglements_clients_gros (statut);
CREATE INDEX idx_regl_cli_gros_date ON reglements_clients_gros (date_reglement);
