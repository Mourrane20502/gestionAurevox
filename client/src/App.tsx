import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Clients from "./pages/Clients";
import ClientSituation from "./pages/ClientSituation";
import PDV from "./pages/PDV";
import Categories from "./pages/Categories";
import Devis from "./pages/Devis";
import DevisGros from "./pages/DevisGros";
import CommandeGros from "./pages/CommandeGros";
import FactureGros from "./pages/FactureGros";
import DevisDetails from "./pages/DevisDetails";
import CommandeDetails from "./pages/CommandeDetails";
import FactureDetails from "./pages/FactureDetails";
import DevisGrosDetails from "./pages/DevisGrosDetails";
import CommandeGrosDetails from "./pages/CommandeGrosDetails";
import FactureGrosDetails from "./pages/FactureGrosDetails";
import Employees from "./pages/Employees";
import Conges from "./pages/Conges";
import Salaries from "./pages/Salaries";
import GestionPaie from "./pages/GestionPaie";
import Pointage from "./pages/Pointage";
import PaieDetails from "./pages/PaieDetails";
import Commandes from "./pages/Commandes";
import Achats from "./pages/Achats";
import Factures from "./pages/Factures";
import Avoirs from "./pages/Avoirs";
import AvoirDetails from "./pages/AvoirDetails";
import AvoirsGros from "./pages/AvoirsGros";
import AvoirGrosDetails from "./pages/AvoirGrosDetails";
import Remboursements from "./pages/Remboursements";
import RemboursementDetails from "./pages/RemboursementDetails";
import Bilan from "./pages/Bilan";
import Reglements from "./pages/Reglements";
import ReglementsClientsGros from "./pages/ReglementsClientsGros";
import ReglementDetails from "./pages/ReglementDetails";
import SignIn from "./pages/SignIn";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import ProfileSettings from "./pages/ProfileSettings";
import NotificationSettings from "./pages/NotificationSettings";
import AccountSettings from "./pages/AccountSettings";
import SocialMediaSettings from "./pages/SocialMediaSettings";
import Fournisseurs from "./pages/Fournisseurs";
import FournisseursSituation from "./pages/FournisseursSituation";
import ReglementsFournisseurs from "./pages/ReglementsFournisseurs";
import FacturesFournisseurs from "./pages/FacturesFournisseurs";
import Gestionnaires from "./pages/Gestionnaires";
import Tickets from "./pages/Tickets";
import LoginJournal from "./pages/LoginJournal";
import Permissions from "./pages/Permissions";
import Approvals from "./pages/Approvals";
import Banque from "./pages/Banque";
import Caisse from "./pages/Caisse";
import Inventory from "@/pages/Inventory";
import InventoryDetails from "@/pages/InventoryDetails";
import ProductMovements from "@/pages/ProductMovements";
import AchatDetails from "@/pages/AchatDetails";
import Promotions from "@/pages/Promotions";
import Autoposting from "@/pages/Autoposting";
import AlertsNotifications from "@/pages/AlertsNotifications";
import Impots from "@/pages/Impots";
import TVA from "@/pages/TVA";
import Recus from "@/pages/Recus";
import EmailMarketing from "@/pages/EmailMarketing";
import BonsLivraison from "@/pages/BonsLivraison";
import BonLivraisonDetails from "@/pages/BonLivraisonDetails";
import NotificationManager from "./components/common/NotificationManager";
import PageTitle from "./components/common/PageTitle";

export default function App() {
  return (
    <BrowserRouter>
      <PageTitle />
      <NotificationManager />
      <Routes>
        <Route path="/" element={<Navigate to="/signin" replace />} />
        <Route path="/signin" element={<SignIn />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="inventaire" element={<Inventory />} />
            <Route path="inventaire/:id" element={<InventoryDetails />} />
            <Route path="mouvements" element={<ProductMovements />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/fidelite" element={<Navigate to="/dashboard" replace />} />
            <Route path="clients/situation" element={<ClientSituation />} />
            <Route path="pdv" element={<PDV />} />
            <Route path="categories" element={<Categories />} />
            <Route path="devis" element={<Devis />} />
            <Route path="devis-gros" element={<DevisGros />} />
            <Route path="devis-gros/:id" element={<DevisGrosDetails />} />
            <Route path="devis/:id" element={<DevisDetails />} />
            <Route path="commandes-gros" element={<CommandeGros />} />
            <Route path="commandes-gros/:id" element={<CommandeGrosDetails />} />
            <Route path="commandes" element={<Commandes />} />
            <Route path="bons-livraison" element={<BonsLivraison />} />
            <Route path="bons-livraison/:id" element={<BonLivraisonDetails />} />
            <Route path="commandes/:id" element={<CommandeDetails />} />
            <Route path="recus" element={<Recus />} />
            <Route path="achats" element={<Achats />} />
            <Route path="achats/:numero" element={<AchatDetails />} />
            <Route path="factures-gros" element={<FactureGros />} />
            <Route path="factures-gros/:id" element={<FactureGrosDetails />} />
            <Route path="factures" element={<Factures />} />
            <Route path="impots" element={<Impots />} />
            <Route path="tva" element={<TVA />} />
            <Route path="factures/:id" element={<FactureDetails />} />
            <Route path="avoirs" element={<Avoirs />} />
            <Route path="avoirs/:id" element={<AvoirDetails />} />
            <Route path="avoirs-gros" element={<AvoirsGros />} />
            <Route path="avoirs-gros/:id" element={<AvoirGrosDetails />} />
            <Route path="remboursements" element={<Remboursements />} />
            <Route path="remboursements/:id" element={<RemboursementDetails />} />
            <Route path="reglements" element={<Reglements />} />
            <Route path="reglements-gros" element={<ReglementsClientsGros />} />
            <Route path="reglements/details/:type/:id" element={<ReglementDetails />} />
            <Route path="fournisseurs" element={<Fournisseurs />} />
            <Route path="fournisseurs/situation" element={<FournisseursSituation />} />
            <Route path="fournisseurs/reglements" element={<ReglementsFournisseurs />} />
            <Route path="fournisseurs/factures" element={<FacturesFournisseurs />} />
            <Route path="gestionnaires" element={<Gestionnaires />} />
            <Route path="employes" element={<Employees />} />
            <Route path="conges" element={<Conges />} />
            <Route path="salaires" element={<Salaries />} />
            <Route path="paiement" element={<GestionPaie />} />
            <Route path="pointage" element={<Pointage />} />
            <Route path="paiement/:id" element={<PaieDetails />} />
            <Route path="users" element={<Users />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="login-journal" element={<LoginJournal />} />
            <Route path="banque" element={<Banque />} />
            <Route path="caisse" element={<Caisse />} />
            <Route path="bilan" element={<Bilan />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="autoposts" element={<Autoposting />} />
            <Route path="email-marketing" element={<EmailMarketing />} />
            <Route path="alerts" element={<AlertsNotifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/profile" element={<ProfileSettings />} />
            <Route path="settings/account" element={<AccountSettings />} />
            <Route path="settings/notifications" element={<NotificationSettings />} />
            <Route path="settings/permissions" element={<Permissions />} />
            <Route path="settings/social-media" element={<SocialMediaSettings />} />
            <Route path="devis/edit/:id" element={<Devis />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}