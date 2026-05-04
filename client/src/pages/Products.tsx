import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Plus, Search, Package, AlertTriangle, Tag, Store, QrCode, ShoppingCart, Bell, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, X, RotateCcw, Download, FileSpreadsheet, Camera, MoreVertical, Trash2, LayoutGrid, Upload, Table as TableIcon } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/common/ui/button";
import { Input } from "@/components/common/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/common/ui/dialog";
import { Label } from "@/components/common/ui/label";
import { Textarea } from "@/components/common/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/common/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/common/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/common/ui/dropdown-menu";
import { toast } from "sonner";
import { EditSvgIcon, ViewSvgIcon } from "@/components/icons/actionSvgIcons";
import JsBarcode from "jsbarcode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import AurevoxLogo from "@/assets/aurevox_logo.png";

interface Product {
    id: number;
    nom: string;
    description: string;
    prix: number;
    stock: number;
    photo: string | null;
    category_name?: string;
    point_de_vente_name?: string;
    id_categorie?: number;
    id_point_de_vente?: number;
    code_barre?: string;
    stock_alert?: number;
    reference?: string;
    etat?: number;
    disponible?: boolean | number;
    grammage?: number;
    poids?: number;
    creator_name?: string;
    creator_prenom?: string;
    product_type_id?: number;
    product_type_name?: string;
    prix_achat?: number;
    fournisseur_id?: number;
    fournisseur_nom?: string;
    num_serie?: string;
    date_expiration?: string;
    date_fabrication?: string;
    date_creation?: string;
    marque_id?: number;
    marque_nom?: string;
    marge?: number;
    has_devis_link?: number | boolean;
    has_commande_link?: number | boolean;
    has_facture_link?: number | boolean;
}

function formatProductPrice(product: Product): string {
    const prix = Number(product.prix);
    if (!Number.isFinite(prix)) return "—";
    return `${prix.toFixed(2)} DH`;
}

interface ProductType {
    id: number;
    name: string;
}

interface Category {
    id: number;
    nom: string;
}

interface PointDeVente {
    id: number;
    nom: string;
}

interface Marque {
    id: number;
    nom: string;
    etat?: number;
}

interface Fournisseur {
    id: number;
    nom: string;
}

function formatCompactCount(value: number): string {
    if (!Number.isFinite(value)) return "0";
    if (value < 1000) return String(value);
    if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    if (value < 1000000) return `${Math.round(value / 1000)}K`;
    return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

type ProductActionConfig = {
    canEdit: boolean;
    canDelete: boolean;
};

const defaultProductActionsByRole: Record<string, ProductActionConfig> = {
    admin: { canEdit: true, canDelete: true },
    responsable: { canEdit: true, canDelete: true },
    directeur: { canEdit: true, canDelete: true },
    comptable: { canEdit: false, canDelete: false },
    user: { canEdit: false, canDelete: false },
};

const getDefaultProductActionsForRole = (roleName: string | null): ProductActionConfig => {
    const role = String(roleName || "").toLowerCase();
    return defaultProductActionsByRole[role] || { canEdit: false, canDelete: false };
};

export default function Products() {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [pointsDeVente, setPointsDeVente] = useState<PointDeVente[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [marques, setMarques] = useState<Marque[]>([]);
    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [gestionnaireName, setGestionnaireName] = useState<string>("AUREVOX AGENCY");
    const [gestionnaireLogoPath, setGestionnaireLogoPath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterReference, setFilterReference] = useState("");
    const [filterPdv, setFilterPdv] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [filterProductType, setFilterProductType] = useState("");
    const [filterFournisseur, setFilterFournisseur] = useState("");
    const [filterMarque, setFilterMarque] = useState("");
    const [filterNumSerie, setFilterNumSerie] = useState("");
    const [filterDateExpiration, setFilterDateExpiration] = useState("");
    const [filterDateFabrication, setFilterDateFabrication] = useState("");
    const [filterMargeMin, setFilterMargeMin] = useState("");
    const [filterMargeMax, setFilterMargeMax] = useState("");
    const [filterPriceSort, setFilterPriceSort] = useState<"" | "asc" | "desc">("");
    const [filterDisponibilite, setFilterDisponibilite] = useState<"" | "disponible" | "epuise">("");
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState<"grid" | "table">("table");

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
    const [productToDelete, setProductToDelete] = useState<number | null>(null);
    const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
    const [isScannerDialogOpen, setIsScannerDialogOpen] = useState(false);
    const [isImportWarningOpen, setIsImportWarningOpen] = useState(false);
    const [isImportTypeDialogOpen, setIsImportTypeDialogOpen] = useState(false);
    const [importAccept, setImportAccept] = useState(".csv");
    const [productImportColumns, setProductImportColumns] = useState<string[]>([]);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);
    const viewBarcodeCanvasRef = useRef<HTMLCanvasElement>(null);

    const [formData, setFormData] = useState({
        nom: "",
        description: "",
        prix: "",
        stock: "",
        id_categorie: "",
        id_point_de_vente: "",
        code_barre: "",
        stock_alert: "1",
        reference: "",
        etat: "1",
        disponible: "true",
        poids: "",
        product_type_id: "",
        prix_achat: "",
        fournisseur_id: "",
        num_serie: "",
        date_expiration: "",
        date_fabrication: "",
        marque_id: "",
        photo: null as File | null,
    });
    const [productActionsByRole, setProductActionsByRole] = useState<Record<string, ProductActionConfig>>(
        defaultProductActionsByRole
    );
    const computedMarge = useMemo(() => {
        const prixVente = Number(formData.prix);
        const prixAchat = Number(formData.prix_achat);
        if (!Number.isFinite(prixVente) || !Number.isFinite(prixAchat)) return "";
        return (prixVente - prixAchat).toFixed(2);
    }, [formData.prix, formData.prix_achat]);

    const token = localStorage.getItem("token");

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [productsRes, categoriesRes, pdvRes, productTypesRes, gestionnaireRes, marquesRes, fournisseursRes] = await Promise.all([
                fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/categories", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/pdv", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/product-types", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/gestionnaires", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/settings/marques", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/fournisseurs", { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (productsRes.ok) setProducts(await productsRes.json());
            if (categoriesRes.ok) setCategories(await categoriesRes.json());
            if (pdvRes.ok) setPointsDeVente(await pdvRes.json());
            if (productTypesRes.ok) setProductTypes(await productTypesRes.json());
            if (marquesRes.ok) setMarques(await marquesRes.json());
            if (fournisseursRes.ok) setFournisseurs(await fournisseursRes.json());
            if (gestionnaireRes.ok) {
                const gestionnaires = await gestionnaireRes.json();
                if (Array.isArray(gestionnaires) && gestionnaires.length > 0) {
                    setGestionnaireName(gestionnaires[0]?.nom || "AUREVOX AGENCY");
                    setGestionnaireLogoPath(gestionnaires[0]?.logo || null);
                }
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const res = await fetch("/api/settings/product-actions", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                setProductActionsByRole({
                    ...defaultProductActionsByRole,
                    ...(data || {}),
                });
            } catch {
                /* ignore */
            }
        })();
    }, [token]);

    // Barcode listener for hardware scanner or fast input
    useEffect(() => {
        let buffer = "";
        let lastKeyTime = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            const currentTime = Date.now();
            
            // If time since last key > 50ms, it's likely manual typing, reset buffer
            // unless the buffer is empty
            if (currentTime - lastKeyTime > 50 && buffer !== "") {
                buffer = "";
            }

            if (e.key === "Enter") {
                if (buffer.length > 2) {
                    // Search for product with this code_barre or reference
                    const matchedProduct = products.find(p => 
                        (p.code_barre && p.code_barre.toLowerCase() === buffer.toLowerCase()) ||
                        (p.reference && p.reference.toLowerCase() === buffer.toLowerCase())
                    );

                    if (matchedProduct) {
                        setViewingProduct(matchedProduct);
                        toast.success(`Produit trouvé : ${matchedProduct.nom}`);
                        buffer = ""; // Clear buffer
                        // Prevent the Enter key from submitting forms or other actions
                        e.preventDefault();
                    }
                }
                buffer = "";
            } else if (e.key.length === 1) {
                // Only add single characters
                buffer += e.key;
            }

            lastKeyTime = currentTime;
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [products]);

    // Camera Scanner Effect
    useEffect(() => {
        let h5qr: Html5Qrcode | null = null;
        
        const initScanner = async () => {
            if (isScannerDialogOpen) {
                // Petit délai pour laisser le Dialog s'ouvrir et le DOM se monter
                await new Promise(r => setTimeout(r, 500));
                
                const element = document.getElementById("reader");
                if (!element) return;

                h5qr = new Html5Qrcode("reader");
                scannerRef.current = h5qr;
                
                try {
                    await h5qr.start(
                        { facingMode: "environment" },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                        },
                        (decodedText) => {
                            const matchedProduct = products.find(p => 
                                (p.code_barre && p.code_barre.toLowerCase() === decodedText.toLowerCase()) ||
                                (p.reference && p.reference.toLowerCase() === decodedText.toLowerCase())
                            );

                            if (matchedProduct) {
                                setViewingProduct(matchedProduct);
                                setIsScannerDialogOpen(false);
                                toast.success(`Produit trouvé : ${matchedProduct.nom}`);
                            }
                        },
                        () => {} // Mute noisy errors
                    );
                } catch (err) {
                    console.error("Scanner error:", err);
                    // Tentative de fallback sur la caméra par défaut si faceMode échoue
                    try {
                        await h5qr.start(
                            { facingMode: "user" },
                            { fps: 10, qrbox: { width: 250, height: 250 } },
                            (decodedText) => {
                                const matchedProduct = products.find(p => 
                                    (p.code_barre && p.code_barre.toLowerCase() === decodedText.toLowerCase()) ||
                                    (p.reference && p.reference.toLowerCase() === decodedText.toLowerCase())
                                );
                                if (matchedProduct) {
                                    setViewingProduct(matchedProduct);
                                    setIsScannerDialogOpen(false);
                                    toast.success(`Produit trouvé : ${matchedProduct.nom}`);
                                }
                            },
                            () => {}
                        );
                    } catch (err2) {
                        toast.error("Erreur caméra : Assurez-vous d'être en HTTPS ou localhost et d'avoir autorisé l'accès.");
                        setIsScannerDialogOpen(false);
                    }
                }
            }
        };

        if (isScannerDialogOpen) {
            initScanner();
        }

        return () => {
            if (h5qr && h5qr.isScanning) {
                h5qr.stop().catch(e => console.log("Cleanup error:", e));
            }
        };
    }, [isScannerDialogOpen, products]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, showOnlyLowStock, filterReference, filterPdv, filterCategory, filterProductType, filterPriceSort, filterDisponibilite]);

    // Auto-generate barcode when code_barre changes
    useEffect(() => {
        if (formData.code_barre && barcodeCanvasRef.current) {
            try {
                JsBarcode(barcodeCanvasRef.current, formData.code_barre, {
                    format: "CODE128",
                    width: 2,
                    height: 60,
                    displayValue: true,
                    fontSize: 14,
                    margin: 10,
                    background: "transparent",
                    lineColor: "currentColor",
                });
            } catch (error) {
                console.error("Erreur lors de la génération automatique du code barre:", error);
            }
        }
    }, [formData.code_barre]);

    // Generate barcode for product details view
    useEffect(() => {
        if (viewingProduct?.code_barre) {
            // Small delay to ensure canvas is rendered
            const timeoutId = setTimeout(() => {
                if (viewBarcodeCanvasRef.current) {
                    try {
                        const canvas = viewBarcodeCanvasRef.current;
                        const ctx = canvas.getContext('2d');

                        if (!ctx) {
                            console.error("Canvas context not available");
                            return;
                        }

                        // Clear canvas first
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        const barcode = viewingProduct.code_barre;
                        if (typeof barcode === 'string') {
                            JsBarcode(viewBarcodeCanvasRef.current, barcode, {
                                format: "CODE128",
                                width: 2,
                                height: 80,
                                displayValue: true,
                                fontSize: 16,
                                margin: 10,
                                background: "transparent",
                                lineColor: "#000000",
                                font: "monospace",
                            });
                        }
                    } catch (error) {
                        console.error("Erreur lors de la génération du code barre dans les détails:", error);
                    }
                }
            }, 100);

            return () => clearTimeout(timeoutId);
        }
    }, [viewingProduct]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            const newData = { ...prev, [name]: value };
            if (name === "stock") {
                newData.disponible = Number(value) > 0 ? "true" : "false";
            }
            if (name === "reference") {
                newData.code_barre = value;
            }
            return newData;
        });
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFormData((prev) => ({ ...prev, photo: e.target.files![0] }));
        }
    };

    const generateBarcode = () => {
        if (!formData.code_barre.trim()) {
            toast.error("Veuillez d'abord saisir un code barre");
            return;
        }

        try {
            if (barcodeCanvasRef.current) {
                JsBarcode(barcodeCanvasRef.current, formData.code_barre, {
                    format: "CODE128",
                    width: 2,
                    height: 60,
                    displayValue: true,
                    fontSize: 14,
                    margin: 10,
                    background: "transparent",
                    lineColor: "currentColor",
                });
                toast.success("Code barre généré avec succès");
            }
        } catch (error) {
            console.error("Erreur lors de la génération du code barre:", error);
            toast.error("Erreur lors de la génération du code barre");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Local duplicate check (name is allowed to repeat)
        const isDuplicate = products.some(p => {
            if (editingProduct && p.id === editingProduct.id) return false;

            const refMatch = formData.reference && p.reference && p.reference.toLowerCase() === formData.reference.toLowerCase();
            const cbMatch = formData.code_barre && p.code_barre && p.code_barre.toLowerCase() === formData.code_barre.toLowerCase();

            return refMatch || cbMatch;
        });

        if (isDuplicate) {
            toast.error("Un produit avec cette référence ou ce code-barre existe déjà");
            return;
        }

        const removedDbFields = new Set(["pricing_metal", "pricing_variant"]);
        const data = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            if (value === null || value === "") return;
            if (removedDbFields.has(key)) return;
            data.append(key, value as string | Blob);
        });
        if (formData.poids !== "") {
            data.set("poids", formData.poids);
        }

        try {
            const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
            const method = editingProduct ? "PUT" : "POST";
            const response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: data,
            });
            if (response.ok) {
                toast.success(editingProduct ? "Produit mis à jour !" : "Produit créé !");
                setIsDialogOpen(false);
                setEditingProduct(null);
                resetForm();
                fetchData();
            } else {
                const errorData = await response.json().catch(() => ({}));
                toast.error(errorData.message || "Échec de l'enregistrement");
            }
        } catch (error) {
            toast.error("Erreur lors de l'enregistrement");
        }
    };

    const handleDelete = (id: number) => {
        const product = products.find((p) => p.id === id);
        if (!product) return;
        const hasDevis = product.has_devis_link === 1 || product.has_devis_link === true;
        const hasCommande = product.has_commande_link === 1 || product.has_commande_link === true;
        const hasFacture = product.has_facture_link === 1 || product.has_facture_link === true;
        if (hasDevis || hasCommande || hasFacture) {
            const linkedTo: string[] = [];
            if (hasDevis) linkedTo.push("devis");
            if (hasCommande) linkedTo.push("commandes");
            if (hasFacture) linkedTo.push("factures");
            toast.error(`Suppression impossible : ce produit est déjà associé à ${linkedTo.join(", ")}.`);
            return;
        }
        setProductToDelete(id);
    };

    const confirmDelete = async () => {
        if (!productToDelete) return;
        try {
            const response = await fetch(`/api/products/${productToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                toast.success("Produit supprimé");
                fetchData();
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || "Échec de la suppression";
                toast.error(errorMessage);
            }
        } catch {
            toast.error("Erreur lors de la suppression");
        } finally {
            setProductToDelete(null);
        }
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            nom: product.nom,
            description: product.description || "",
            prix: product.prix?.toString() || "",
            stock: product.stock.toString(),
            id_categorie: product.id_categorie?.toString() || "",
            id_point_de_vente: product.id_point_de_vente?.toString() || "",
            code_barre: product.code_barre || "",
            stock_alert: product.stock_alert?.toString() || "",
            reference: product.reference || "",
            etat: product.etat?.toString() || "1",
            disponible: product.disponible === 0 || product.disponible === false ? "false" : "true",
            poids: (product.poids ?? product.grammage)?.toString() || "",
            product_type_id: product.product_type_id?.toString() || "",
            prix_achat: product.prix_achat?.toString() || "",
            fournisseur_id: product.fournisseur_id?.toString() || "",
            num_serie: product.num_serie || "",
            date_expiration: product.date_expiration ? String(product.date_expiration).slice(0, 10) : "",
            date_fabrication: product.date_fabrication ? String(product.date_fabrication).slice(0, 10) : "",
            marque_id: product.marque_id?.toString() || "",
            photo: null,
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setFormData({
            nom: "", description: "", prix: "", stock: "",
            id_categorie: "", id_point_de_vente: "", code_barre: "",
            stock_alert: "1", reference: "", etat: "1", disponible: "true", poids: "",
            product_type_id: "", prix_achat: "", fournisseur_id: "", num_serie: "", date_expiration: "", date_fabrication: "", marque_id: "", photo: null,
        });
    };

    const activeFilterCount = [
        searchTerm,
        filterReference,
        filterPdv,
        filterCategory,
        filterProductType,
        filterFournisseur,
        filterMarque,
        filterNumSerie,
        filterDateExpiration,
        filterDateFabrication,
        filterMargeMin,
        filterMargeMax,
        filterPriceSort,
        filterDisponibilite,
    ].filter(Boolean).length;

    const resetAllFilters = () => {
        setSearchTerm("");
        setFilterReference("");
        setFilterPdv("");
        setFilterCategory("");
        setFilterProductType("");
        setFilterFournisseur("");
        setFilterMarque("");
        setFilterNumSerie("");
        setFilterDateExpiration("");
        setFilterDateFabrication("");
        setFilterMargeMin("");
        setFilterMargeMax("");
        setFilterPriceSort("");
        setFilterDisponibilite("");
    };

    const isProductAvailableForFilter = (product: Product) => {
        return Number(product.stock) > 0;
    };

    const filteredProducts = products
    .filter((p) => {
        const matchesSearch = searchTerm
            ? p.nom.toLowerCase().includes(searchTerm.toLowerCase())
            : true;
        const matchesReference = filterReference
            ? (p.reference || "").toLowerCase().includes(filterReference.toLowerCase())
            : true;
        const matchesPdv = filterPdv
            ? p.id_point_de_vente?.toString() === filterPdv
            : true;
        const matchesCategory = filterCategory
            ? p.id_categorie?.toString() === filterCategory
            : true;
        const matchesProductType = filterProductType
            ? p.product_type_id?.toString() === filterProductType
            : true;
        const matchesFournisseur = filterFournisseur
            ? p.fournisseur_id?.toString() === filterFournisseur
            : true;
        const matchesMarque = filterMarque
            ? p.marque_id?.toString() === filterMarque
            : true;
        const matchesNumSerie = filterNumSerie
            ? (p.num_serie || "").toLowerCase().includes(filterNumSerie.toLowerCase())
            : true;
        const rowExpiration = p.date_expiration ? String(p.date_expiration).slice(0, 10) : "";
        const rowFabrication = p.date_fabrication ? String(p.date_fabrication).slice(0, 10) : "";
        const matchesDateExpiration = filterDateExpiration ? rowExpiration === filterDateExpiration : true;
        const matchesDateFabrication = filterDateFabrication ? rowFabrication === filterDateFabrication : true;
        const margeValue = Number(p.marge ?? ((Number(p.prix) || 0) - (Number(p.prix_achat) || 0)));
        const margeMinVal = filterMargeMin === "" ? null : Number(filterMargeMin);
        const margeMaxVal = filterMargeMax === "" ? null : Number(filterMargeMax);
        const matchesMargeMin = margeMinVal == null || Number.isNaN(margeMinVal) ? true : margeValue >= margeMinVal;
        const matchesMargeMax = margeMaxVal == null || Number.isNaN(margeMaxVal) ? true : margeValue <= margeMaxVal;
        const matchesDisponibilite = filterDisponibilite
            ? (filterDisponibilite === "disponible"
                ? isProductAvailableForFilter(p)
                : !isProductAvailableForFilter(p))
            : true;
        const matchesLowStock = showOnlyLowStock ? (p.stock_alert && p.stock <= p.stock_alert) : true;
        return matchesSearch
            && matchesReference
            && matchesPdv
            && matchesCategory
            && matchesProductType
            && matchesFournisseur
            && matchesMarque
            && matchesNumSerie
            && matchesDateExpiration
            && matchesDateFabrication
            && matchesMargeMin
            && matchesMargeMax
            && matchesDisponibilite
            && matchesLowStock;
    })
    .sort((a, b) => {
        if (!filterPriceSort) return 0;
        const prixA = Number(a.prix) || 0;
        const prixB = Number(b.prix) || 0;
        return filterPriceSort === "asc" ? prixA - prixB : prixB - prixA;
    });

    const lowStockCount = products.filter(
        (p) => p.stock_alert && p.stock <= p.stock_alert
    ).length;

    const totalUnitsInStock = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const canSellProductFromList = (product: Product) => {
        return isProductAvailableForFilter(product);
    };

    const getStockBadge = (product: Product) => {
        const isLow = product.stock_alert && product.stock <= product.stock_alert;
        if (isLow) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                    {product.stock}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                {product.stock}
            </span>
        );
    };

    const role = localStorage.getItem("role");
    const isAdmin = role === "admin";
    const canManageProducts = isAdmin || role === "responsable" || role === "directeur";
    const roleKey = String(role || "").toLowerCase();
    const productActions = productActionsByRole[roleKey] || getDefaultProductActionsForRole(role);
    // Edition/suppression pilotées par le réglage admin par rôle (backend).
    const canEditProducts = Boolean(productActions.canEdit);
    const canDeleteProducts = Boolean(productActions.canDelete);

    // ── Export Functions ──────────────────────────────────────────
    const getExportData = () => filteredProducts.map((p) => ({
        "Nom": p.nom,
        "Référence": p.reference || "—",
        "Catégorie": p.category_name || "—",
        "Type": p.product_type_name || "—",
        "Prix (DH)": formatProductPrice(p),
        "Prix d'achat (DH)": p.prix_achat != null ? `${Number(p.prix_achat).toFixed(2)} DH` : "—",
        "Marge (DH)": p.marge != null ? `${Number(p.marge).toFixed(2)} DH` : `${((Number(p.prix) || 0) - (Number(p.prix_achat) || 0)).toFixed(2)} DH`,
        "Marque": p.marque_nom || "—",
        "Fournisseur": p.fournisseur_nom || "—",
        "N° série": p.num_serie || "—",
        "Date fabrication": p.date_fabrication ? String(p.date_fabrication).slice(0, 10) : "—",
        "Date expiration": p.date_expiration ? String(p.date_expiration).slice(0, 10) : "—",
        "Stock": p.stock,
        "Point de vente": p.point_de_vente_name || "—",
        "Disponibilité": (p.disponible === 0 || p.disponible === false) ? "Non disponible" : "Disponible",
    }));

    const exportToPDF = async () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", format: "a3" });
            const pageWidth = doc.internal.pageSize.getWidth();

            // Image loading helper (converts to base64 for better PDF reliability)
            const loadImgToBase64 = (url: string) => new Promise<string | null>((res) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) { res(null); return; }
                        ctx.drawImage(img, 0, 0);
                        // Using JPEG for smaller PDF size
                        res(canvas.toDataURL("image/jpeg", 0.7));
                    } catch (e) {
                        console.error("Canvas error:", e);
                        res(null);
                    }
                };
                img.onerror = (e) => {
                    console.error("Image load error:", url, e);
                    res(null);
                };
            });

            // Preload logo and product images
            const loadingToastId = toast.loading("Préparation du PDF avec images...", { id: "pdf-loading" });

            const logoSource = gestionnaireLogoPath
                ? `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${gestionnaireLogoPath}`
                : AurevoxLogo;
            const logoImgPromise = loadImgToBase64(logoSource);
            const productImagesPromise = Promise.all(
                filteredProducts.map(async (p) => {
                    if (p.photo) {
                        // Use the correct server URL
                        const imgBase64 = await loadImgToBase64(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(p.photo)}`);
                        return { id: p.id, img: imgBase64 };
                    }
                    return { id: p.id, img: null };
                })
            );

            const [logoImgData, productImages] = await Promise.all([logoImgPromise, productImagesPromise]);
            const imageMap = new Map(productImages.map(item => [item.id, item.img]));

            toast.dismiss(loadingToastId);

            // Header Background
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, 45, "F");

            // Logo
            if (logoImgData) {
                // Use JPEG for adding to PDF if logo is large
                doc.addImage(logoImgData, "JPEG", 14, 10, 22, 22);
            }

            // Header Text
            doc.setFontSize(22);
            doc.setTextColor(67, 56, 202); // indigo
            doc.setFont("helvetica", "bold");
            doc.text((gestionnaireName || "AUREVOX AGENCY").toUpperCase(), 42, 20);

            doc.setFontSize(14);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Liste des Produits", 42, 28);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Exporté le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 20, { align: "right" });
            doc.text(`Total : ${filteredProducts.length} produit(s)`, pageWidth - 14, 26, { align: "right" });

            const tableData = filteredProducts.map((p) => [
                "", // Placeholder for Photo
                p.nom,
                p.reference || "—",
                p.category_name || "—",
                formatProductPrice(p),
                p.prix_achat != null ? `${Number(p.prix_achat).toFixed(2)} DH` : "—",
                p.marge != null ? `${Number(p.marge).toFixed(2)} DH` : `${((Number(p.prix) || 0) - (Number(p.prix_achat) || 0)).toFixed(2)} DH`,
                p.marque_nom || "—",
                p.fournisseur_nom || "—",
                p.num_serie || "—",
                p.date_fabrication ? String(p.date_fabrication).slice(0, 10) : "—",
                p.date_expiration ? String(p.date_expiration).slice(0, 10) : "—",
                p.stock.toString(),
                p.point_de_vente_name || "—",
                (p.disponible === 0 || p.disponible === false) ? "Non disponible" : "Disponible",
            ]);

            autoTable(doc, {
                startY: 48,
                head: [[
                    "Photo",
                    "Nom",
                    "Référence",
                    "Catégorie",
                    "Prix",
                    "Achat",
                    "Marge",
                    "Marque",
                    "Fournisseur",
                    "Série",
                    "Fab",
                    "Exp",
                    "Stock",
                    "PDV",
                    "Dispo"
                ]],
                body: tableData,
                theme: "grid",
                headStyles: {
                    fillColor: [67, 56, 202],
                    textColor: 255,
                    fontSize: 8,
                    fontStyle: "bold",
                    halign: "center",
                    cellPadding: 3,
                },
                bodyStyles: {
                    fontSize: 7,
                    cellPadding: 3,
                    minCellHeight: 18,
                    valign: "middle",
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252],
                },
                columnStyles: {
                    0: { cellWidth: 20, halign: "center" }, // Photo
                    1: { fontStyle: "bold", cellWidth: 42 }, // Nom
                    2: { cellWidth: 30 }, // Référence
                    3: { cellWidth: 28 }, // Catégorie
                    4: { halign: "right", cellWidth: 22 }, // Prix
                    5: { halign: "right", cellWidth: 22 }, // Achat
                    6: { halign: "right", cellWidth: 22 }, // Marge
                    7: { cellWidth: 22 }, // Marque
                    8: { cellWidth: 30 }, // Fournisseur
                    9: { cellWidth: 24 }, // Série
                    10: { cellWidth: 20 }, // Fab
                    11: { cellWidth: 20 }, // Exp
                    12: { halign: "center", cellWidth: 16 }, // Stock
                    13: { cellWidth: 32 }, // PDV
                    14: { halign: "center", cellWidth: 20 }, // Dispo
                },
                didDrawCell: (data) => {
                    if (data.section === "body" && data.column.index === 0) {
                        const product = filteredProducts[data.row.index];
                        const img = imageMap.get(product.id);
                        if (img) {
                            const padding = 2;
                            const size = data.cell.height - padding * 2;
                            const x = data.cell.x + (data.cell.width - size) / 2;
                            const y = data.cell.y + padding;
                            doc.addImage(img, "JPEG", x, y, size, size);
                        }
                    }
                },
                didParseCell: (data: any) => {
                    // Color stock column in red if low
                    if (data.section === "body" && data.column.index === 5) { // Stock index
                        const product = filteredProducts[data.row.index];
                        if (product && product.stock_alert && product.stock <= product.stock_alert) {
                            data.cell.styles.textColor = [220, 38, 38];
                            data.cell.styles.fontStyle = "bold";
                        }
                    }
                    // Color availability
                    if (data.section === "body" && data.column.index === 7) { // Dispo index
                        if (data.cell.raw === "Non disponible") {
                            data.cell.styles.textColor = [220, 38, 38];
                        } else {
                            data.cell.styles.textColor = [22, 163, 74];
                        }
                    }
                },
                margin: { left: 14, right: 14 },
            });

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${i} / ${pageCount} — ${(gestionnaireName || "AUREVOX AGENCY").toUpperCase()}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
            }

            doc.save(`produits_${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF exporté avec succès");
        } catch (error) {
            console.error("Erreur export PDF:", error);
            toast.error("Erreur lors de l'export PDF");
        }
    };

    const exportToXLS = () => {
        try {
            const data = getExportData();
            const worksheet = XLSX.utils.json_to_sheet(data);

            // Set column widths
            worksheet["!cols"] = [
                { wch: 30 }, // Nom
                { wch: 18 }, // Référence
                { wch: 18 }, // Catégorie
                { wch: 16 }, // Type
                { wch: 14 }, // Prix
                { wch: 16 }, // Prix d'achat
                { wch: 14 }, // Marge
                { wch: 16 }, // Marque
                { wch: 20 }, // Fournisseur
                { wch: 18 }, // N° série
                { wch: 16 }, // Date fabrication
                { wch: 16 }, // Date expiration
                { wch: 10 }, // Stock
                { wch: 20 }, // Point de vente
                { wch: 18 }, // Disponibilité
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Produits");
            XLSX.writeFile(workbook, `produits_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success("Excel exporté avec succès");
        } catch (error) {
            console.error("Erreur export Excel:", error);
            toast.error("Erreur lors de l'export Excel");
        }
    };

    const fetchProductImportColumns = async () => {
        if (productImportColumns.length > 0) return productImportColumns;

        const response = await fetch("/api/products/import-template-columns", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error("Impossible de récupérer les colonnes du modèle");
        }

        const data = await response.json();
            const columns: string[] = Array.isArray(data.columns)
                ? data.columns.map((c: unknown) => String(c))
                : [];
        setProductImportColumns(columns);
        return columns;
    };

    const handleImportClick = () => {
        setIsImportWarningOpen(true);
    };

    const downloadImportSample = async () => {
        try {
            const columns = await fetchProductImportColumns();
            if (columns.length === 0) {
                toast.error("Aucune colonne trouvée pour le modèle");
                return;
            }

            const sampleRow: Record<string, string | number> = {};
            columns.forEach((col: string) => { sampleRow[col] = ""; });

            // Pré-remplir quelques champs clés pour guider l'utilisateur.
            if ("nom" in sampleRow) sampleRow.nom = "Bague Or";
            if ("prix" in sampleRow) sampleRow.prix = 1200;
            if ("stock" in sampleRow) sampleRow.stock = 10;
            if ("reference" in sampleRow) sampleRow.reference = "BG-001";
            if ("photo" in sampleRow) sampleRow.photo = "bague_or.jpg";
            if ("id_categorie" in sampleRow) sampleRow.id_categorie = 1;
            if ("id_point_de_vente" in sampleRow) sampleRow.id_point_de_vente = 1;

            const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: columns });
            worksheet["!cols"] = columns.map((col: string) => ({ wch: Math.max(16, col.length + 4) }));

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Template_Produits");
            XLSX.writeFile(workbook, "produits_exemplaire.xlsx");

            toast.success("Fichier exemplaire téléchargé");
        } catch (error) {
            console.error("Erreur téléchargement modèle import:", error);
            toast.error("Impossible de télécharger le fichier exemplaire");
        }
    };

    const handleContinueImport = () => {
        setIsImportWarningOpen(false);
        setIsImportTypeDialogOpen(true);
    };

    const handleImportTypeSelect = (type: "csv" | "excel") => {
        setImportAccept(type === "csv" ? ".csv" : ".xlsx,.xls");
        setIsImportTypeDialogOpen(false);
        setTimeout(() => importInputRef.current?.click(), 0);
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const selectedType = importAccept.includes("csv") ? "CSV" : "Excel";
            const columns = await fetchProductImportColumns();

            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];

            if (!firstSheetName) {
                toast.error("Le fichier importé est vide");
                return;
            }

            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });

            if (rawRows.length === 0) {
                toast.error("Aucune donnée trouvée dans le fichier");
                return;
            }

            const normalizedRows = rawRows.map((row) => {
                const normalized: Record<string, any> = {};
                columns.forEach((col: string) => {
                    normalized[col] = row[col] ?? "";
                });
                return normalized;
            });

            const response = await fetch("/api/products/import", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ products: normalizedRows }),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(result.message || "Erreur lors de l'import");
                return;
            }

            const createdCount = Number(result.createdCount || 0);
            const skippedCount = Number(result.skippedCount || 0);
            if (createdCount > 0) {
                toast.success(`${createdCount} produit(s) importé(s) depuis ${selectedType}`);
            }
            if (skippedCount > 0) {
                toast.warning(`${skippedCount} ligne(s) ignorée(s)`, {
                    description: Array.isArray(result.errors) ? result.errors.slice(0, 2).join(" | ") : undefined,
                });
            }

            fetchData();
        } catch (error) {
            console.error("Erreur import produits:", error);
            toast.error("Erreur lors de la lecture/import du fichier");
        }

        e.target.value = "";
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Package className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        Produits
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Gérez votre catalogue de produits</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-xl border border-border overflow-hidden">
                        <Button
                            type="button"
                            variant={viewMode === "grid" ? "default" : "ghost"}
                            size="sm"
                            className={cn("h-9 px-3 rounded-none", viewMode === "grid" ? "bg-indigo-600 text-white" : "text-muted-foreground")}
                            onClick={() => setViewMode("grid")}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "table" ? "default" : "ghost"}
                            size="sm"
                            className={cn("h-9 px-3 rounded-none border-l border-border", viewMode === "table" ? "bg-indigo-600 text-white" : "text-muted-foreground")}
                            onClick={() => setViewMode("table")}
                        >
                            <TableIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    {/* Export Buttons */}
                    <Button
                        variant="outline"
                        className="h-9 gap-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all duration-300 cursor-pointer"
                        onClick={exportToPDF}
                        disabled={filteredProducts.length === 0}
                    >
                        <Download className="h-4 w-4" />
                        PDF
                    </Button>
                    <Button
                        variant="outline"
                        className="h-9 gap-2 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-300 cursor-pointer"
                        onClick={exportToXLS}
                        disabled={filteredProducts.length === 0}
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel
                    </Button>
                    {canManageProducts && (
                        <>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept={importAccept}
                                className="hidden"
                                onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                                onChange={handleImportFileChange}
                            />
                            <Button
                                variant="outline"
                                className="h-9 gap-2 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 cursor-pointer"
                                onClick={handleImportClick}
                            >
                                <Upload className="h-4 w-4" />
                                Importer
                            </Button>
                        </>
                    )}
                    {/* Stock Notification Bell */}
                    <div className="relative group">
                        <button
                            onClick={() => setShowOnlyLowStock(!showOnlyLowStock)}
                            className={cn(
                                "relative p-2 rounded-xl transition-all duration-300 border",
                                showOnlyLowStock
                                    ? "bg-amber-100 border-amber-300 text-amber-600 shadow-inner"
                                    : lowStockCount > 0
                                        ? "bg-red-50 border-red-100 text-red-500 hover:bg-red-100 animate-pulse"
                                        : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                            )}
                            title={showOnlyLowStock ? "Afficher tous les produits" : "Afficher stock faible"}
                        >
                            <Bell className="h-5 w-5" />
                            {lowStockCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white leading-none">
                                    {formatCompactCount(lowStockCount)}
                                </span>
                            )}
                        </button>

                        {/* Tooltip-like info */}
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 transform translate-y-1 group-hover:translate-y-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">État du Stock</p>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Unités totales</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{totalUnitsInStock}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Alertes stock</span>
                                    <span className={cn("font-bold px-1.5 py-0.5 rounded", lowStockCount > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")}>
                                        {lowStockCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {(canManageProducts || canEditProducts) && (
                        <Dialog open={isDialogOpen} onOpenChange={(open) => {
                            setIsDialogOpen(open);
                            if (!open) { setEditingProduct(null); resetForm(); }
                        }}>
                            {canManageProducts && (
                                <DialogTrigger asChild>
                                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer">
                                        <Plus className="mr-2 h-4 w-4" /> Ajouter un produit
                                    </Button>
                                </DialogTrigger>
                            )}
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-lg">
                                        <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                        {editingProduct ? "Modifier le produit" : "Nouveau produit"}
                                    </DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleSubmit} className="grid gap-4 py-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="nom" className="text-sm font-medium">Nom *</Label>
                                            <Input id="nom" name="nom" value={formData.nom} onChange={handleInputChange} required className="h-10" />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Type de produit</Label>
                                            <Select onValueChange={(v) => handleSelectChange("product_type_id", v === "__none__" ? "" : v)} value={formData.product_type_id || "__none__"}>
                                                <SelectTrigger className="h-10">
                                                    <SelectValue placeholder="Choisir..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Aucun type</SelectItem>
                                                    {productTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="reference" className="text-sm font-medium">Référence</Label>
                                            <Input id="reference" name="reference" value={formData.reference} onChange={handleInputChange} className="h-10" />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Point de vente</Label>
                                            <Select onValueChange={(v) => handleSelectChange("id_point_de_vente", v === "__none__" ? "" : v)} value={formData.id_point_de_vente || "__none__"}>
                                                <SelectTrigger className="h-10"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Aucun point de vente</SelectItem>
                                                    {pointsDeVente.map((pdv) => (
                                                        <SelectItem key={pdv.id} value={pdv.id.toString()}>{pdv.nom}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="poids" className="text-sm font-medium">Unité de mesure</Label>
                                            <Input id="poids" name="poids" type="number" step="0.01" min={0} value={formData.poids} onChange={handleInputChange} className="h-10" />
                                            <p className="text-[11px] text-muted-foreground leading-snug">
                                                Renseignez le poids si nécessaire pour ce produit.
                                            </p>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="prix" className="text-sm font-medium">
                                                Prix De Vente (HT) *
                                            </Label>
                                            <Input id="prix" name="prix" type="number" step="0.01" value={formData.prix} onChange={handleInputChange} required className="h-10" />
                                            <p className="text-[11px] text-muted-foreground leading-snug opacity-0 select-none">
                                                Texte d'alignement
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="prix_achat" className="text-sm font-medium">Prix d'achat (HT)</Label>
                                            <Input id="prix_achat" name="prix_achat" type="number" step="0.01" value={formData.prix_achat} onChange={handleInputChange} className="h-10" />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="marge_auto" className="text-sm font-medium">Marge (auto)</Label>
                                            <Input
                                                id="marge_auto"
                                                value={computedMarge === "" ? "—" : `${computedMarge} DH`}
                                                readOnly
                                                className="h-10 bg-muted/40 font-semibold"
                                            />
                                            <p className="text-[11px] text-muted-foreground leading-snug">
                                                Calcul automatique: prix de vente - prix d'achat.
                                            </p>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Marque</Label>
                                            <Select onValueChange={(v) => handleSelectChange("marque_id", v === "__none__" ? "" : v)} value={formData.marque_id || "__none__"}>
                                                <SelectTrigger className="h-10"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Aucune marque</SelectItem>
                                                    {marques
                                                        .filter((m) => Number(m.etat ?? 1) === 1 || String(m.id) === formData.marque_id)
                                                        .map((m) => (
                                                            <SelectItem key={m.id} value={m.id.toString()}>{m.nom}</SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Fournisseur</Label>
                                            <Select onValueChange={(v) => handleSelectChange("fournisseur_id", v === "__none__" ? "" : v)} value={formData.fournisseur_id || "__none__"}>
                                                <SelectTrigger className="h-10"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Aucun fournisseur</SelectItem>
                                                    {fournisseurs.map((f) => (
                                                        <SelectItem key={f.id} value={f.id.toString()}>{f.nom}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="num_serie" className="text-sm font-medium">Numéro de série</Label>
                                            <Input id="num_serie" name="num_serie" value={formData.num_serie} onChange={handleInputChange} className="h-10" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="date_fabrication" className="text-sm font-medium">Date de fabrication</Label>
                                            <Input id="date_fabrication" name="date_fabrication" type="date" value={formData.date_fabrication} onChange={handleInputChange} className="h-10" />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="date_expiration" className="text-sm font-medium">Date d'expiration</Label>
                                            <Input id="date_expiration" name="date_expiration" type="date" value={formData.date_expiration} onChange={handleInputChange} className="h-10" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="stock" className="text-sm font-medium">Stock</Label>
                                            <Input id="stock" name="stock" type="number" value={formData.stock} onChange={handleInputChange} className="h-10" />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="stock_alert" className="text-sm font-medium">Alerte stock</Label>
                                            <Input id="stock_alert" name="stock_alert" type="number" value={formData.stock_alert} onChange={handleInputChange} className="h-10" />
                                        </div>
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="code_barre" className="text-sm font-medium">Code barre</Label>
                                        <div className="flex gap-2">
                                            <Input id="code_barre" name="code_barre" value={formData.code_barre} onChange={handleInputChange} className="h-10" placeholder="Saisir le code barre" />
                                            <Button type="button" variant="outline" size="icon" onClick={generateBarcode} className="h-10 w-10 shrink-0">
                                                <QrCode className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Barcode Display */}
                                    {formData.code_barre && (
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium">Aperçu du code barre</Label>
                                            <div className="bg-muted/50 p-4 rounded-lg border border-border flex justify-center">
                                                <canvas
                                                    ref={barcodeCanvasRef}
                                                    className="max-w-full h-auto"
                                                    style={{ maxHeight: '80px' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Catégorie</Label>
                                            <Select onValueChange={(v) => handleSelectChange("id_categorie", v === "__none__" ? "" : v)} value={formData.id_categorie || "__none__"}>
                                                <SelectTrigger className="h-10"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Aucune catégorie</SelectItem>
                                                    {categories.map((cat) => (
                                                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.nom}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-sm font-medium text-foreground">Disponibilité</Label>
                                            <Select onValueChange={(v) => handleSelectChange("disponible", v)} value={formData.disponible}>
                                                <SelectTrigger className="h-10"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="true">Disponible</SelectItem>
                                                    <SelectItem value="false">Non Disponible</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                                        <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} rows={3} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="photo" className="text-sm font-medium">Photo</Label>
                                        <Input id="photo" name="photo" type="file" onChange={handleFileChange} className="h-10" />
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                            {editingProduct ? "Mettre à jour" : "Créer le produit"}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg"><Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total produits</p>
                        <p className="text-2xl font-bold text-foreground">{products.length}</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg"><AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Stock faible</p>
                        <p className="text-2xl font-bold text-foreground">{lowStockCount}</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg"><Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Catégories</p>
                        <p className="text-2xl font-bold text-foreground">{categories.length}</p>
                    </div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400" />
                        <Input
                            placeholder="Rechercher un produit (nom, référence, code-barres)..."
                            className="pl-9 h-10 bg-card border-border pr-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && searchTerm.length > 2) {
                                    const matchedProduct = products.find(p => 
                                        (p.code_barre && p.code_barre.toLowerCase() === searchTerm.toLowerCase()) ||
                                        (p.reference && p.reference.toLowerCase() === searchTerm.toLowerCase())
                                    );
                                    if (matchedProduct) {
                                        setViewingProduct(matchedProduct);
                                        toast.success(`Produit trouvé : ${matchedProduct.nom}`);
                                    }
                                }
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setIsScannerDialogOpen(true)}
                            title="Scanner avec la caméra"
                        >
                            <Camera className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button
                        variant={showFilters ? "default" : "outline"}
                        className={cn(
                            "h-10 gap-2 transition-all duration-300",
                            showFilters
                                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
                                : "border-border hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800"
                        )}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filtres avancés
                        {activeFilterCount > 0 && (
                            <span className={cn(
                                "ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                                showFilters
                                    ? "bg-white/20 text-white"
                                    : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                            )}>
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                    {activeFilterCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 gap-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={resetAllFilters}
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Réinitialiser
                        </Button>
                    )}
                </div>

                {/* Advanced Filters Panel */}
                <div
                    className={cn(
                        "overflow-hidden transition-all duration-400 ease-in-out",
                        showFilters ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
                    )}
                >
                    <div className="bg-card rounded-xl border border-border shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <SlidersHorizontal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                Filtres de recherche
                            </h3>
                            <button
                                onClick={() => setShowFilters(false)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Nom Produit */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nom du produit</Label>
                                <div className="relative">
                                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Filtrer par nom..."
                                        className="pl-9 h-9 bg-background border-border text-sm"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    {searchTerm && (
                                        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchTerm("")}>
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Référence */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Référence</Label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Filtrer par référence..."
                                        className="pl-9 h-9 bg-background border-border text-sm"
                                        value={filterReference}
                                        onChange={(e) => setFilterReference(e.target.value)}
                                    />
                                    {filterReference && (
                                        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilterReference("")}>
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Point de Vente */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Point de vente</Label>
                                <Select onValueChange={(v) => setFilterPdv(v === "__all__" ? "" : v)} value={filterPdv || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm">
                                        <div className="flex items-center gap-2">
                                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Tous les points de vente" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Tous les points de vente</SelectItem>
                                        {pointsDeVente.map((pdv) => (
                                            <SelectItem key={pdv.id} value={pdv.id.toString()}>{pdv.nom}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Type de Produit */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catégorie</Label>
                                <Select onValueChange={(v) => setFilterCategory(v === "__all__" ? "" : v)} value={filterCategory || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm">
                                        <div className="flex items-center gap-2">
                                            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Toutes les catégories" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Toutes les catégories</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id.toString()}>{cat.nom}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Type de Produit */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type de produit</Label>
                                <Select onValueChange={(v) => {
                                    const next = v === "__all__" ? "" : v;
                                    setFilterProductType(next);
                                }} value={filterProductType || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm">
                                        <div className="flex items-center gap-2">
                                            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                            <SelectValue placeholder="Tous les types" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Tous les types</SelectItem>
                                        {productTypes.map((type) => (
                                            <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Tri prix */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tri prix</Label>
                                <Select onValueChange={(v) => setFilterPriceSort(v === "__all__" ? "" : (v as "asc" | "desc"))} value={filterPriceSort || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm">
                                        <SelectValue placeholder="Pas de tri" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Pas de tri</SelectItem>
                                        <SelectItem value="asc">Prix croissant</SelectItem>
                                        <SelectItem value="desc">Prix décroissant</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Disponibilité */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disponibilité</Label>
                                <Select onValueChange={(v) => setFilterDisponibilite(v === "__all__" ? "" : (v as "disponible" | "epuise"))} value={filterDisponibilite || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm">
                                        <SelectValue placeholder="Toutes les disponibilités" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Toutes les disponibilités</SelectItem>
                                        <SelectItem value="disponible">Disponible</SelectItem>
                                        <SelectItem value="epuise">Epuisé</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fournisseur</Label>
                                <Select onValueChange={(v) => setFilterFournisseur(v === "__all__" ? "" : v)} value={filterFournisseur || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm"><SelectValue placeholder="Tous les fournisseurs" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Tous les fournisseurs</SelectItem>
                                        {fournisseurs.map((f) => (
                                            <SelectItem key={f.id} value={f.id.toString()}>{f.nom}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marque</Label>
                                <Select onValueChange={(v) => setFilterMarque(v === "__all__" ? "" : v)} value={filterMarque || "__all__"}>
                                    <SelectTrigger className="h-9 bg-background border-border text-sm"><SelectValue placeholder="Toutes les marques" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Toutes les marques</SelectItem>
                                        {marques.map((m) => (
                                            <SelectItem key={m.id} value={m.id.toString()}>{m.nom}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">N° série</Label>
                                <Input
                                    placeholder="Filtrer par n° série..."
                                    className="h-9 bg-background border-border text-sm"
                                    value={filterNumSerie}
                                    onChange={(e) => setFilterNumSerie(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date expiration</Label>
                                <Input type="date" className="h-9 bg-background border-border text-sm" value={filterDateExpiration} onChange={(e) => setFilterDateExpiration(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date fabrication</Label>
                                <Input type="date" className="h-9 bg-background border-border text-sm" value={filterDateFabrication} onChange={(e) => setFilterDateFabrication(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marge min (DH)</Label>
                                <Input type="number" step="0.01" className="h-9 bg-background border-border text-sm" value={filterMargeMin} onChange={(e) => setFilterMargeMin(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marge max (DH)</Label>
                                <Input type="number" step="0.01" className="h-9 bg-background border-border text-sm" value={filterMargeMax} onChange={(e) => setFilterMargeMax(e.target.value)} />
                            </div>
                        </div>

                        {/* Active filters tags */}
                        {activeFilterCount > 0 && (
                            <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Filtres actifs :</span>
                                {searchTerm && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                        Nom: "{searchTerm}"
                                        <button onClick={() => setSearchTerm("")} className="ml-0.5 hover:text-indigo-900 dark:hover:text-indigo-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterReference && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800">
                                        Réf: "{filterReference}"
                                        <button onClick={() => setFilterReference("")} className="ml-0.5 hover:text-purple-900 dark:hover:text-purple-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterPdv && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                                        PDV: {pointsDeVente.find(p => p.id.toString() === filterPdv)?.nom || filterPdv}
                                        <button onClick={() => setFilterPdv("")} className="ml-0.5 hover:text-emerald-900 dark:hover:text-emerald-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterCategory && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                                        Catégorie: {categories.find((c) => c.id.toString() === filterCategory)?.nom || filterCategory}
                                        <button onClick={() => setFilterCategory("")} className="ml-0.5 hover:text-violet-900 dark:hover:text-violet-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterProductType && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                                        Type: {productTypes.find(t => t.id.toString() === filterProductType)?.name || filterProductType}
                                        <button onClick={() => setFilterProductType("")} className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterPriceSort && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-800">
                                        Prix: {filterPriceSort === "asc" ? "Croissant" : "Décroissant"}
                                        <button onClick={() => setFilterPriceSort("")} className="ml-0.5 hover:text-cyan-900 dark:hover:text-cyan-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterDisponibilite && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-800">
                                        Disponibilité: {filterDisponibilite === "disponible" ? "Disponible" : "Epuisé"}
                                        <button onClick={() => setFilterDisponibilite("")} className="ml-0.5 hover:text-rose-900 dark:hover:text-rose-200"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterFournisseur && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                        Fournisseur: {fournisseurs.find((f) => String(f.id) === filterFournisseur)?.nom || filterFournisseur}
                                        <button onClick={() => setFilterFournisseur("")} className="ml-0.5 hover:text-amber-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterMarque && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-lime-50 text-lime-700 border border-lime-100">
                                        Marque: {marques.find((m) => String(m.id) === filterMarque)?.nom || filterMarque}
                                        <button onClick={() => setFilterMarque("")} className="ml-0.5 hover:text-lime-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterNumSerie && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                                        N° série: "{filterNumSerie}"
                                        <button onClick={() => setFilterNumSerie("")} className="ml-0.5 hover:text-zinc-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterDateExpiration && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
                                        Expiration: {filterDateExpiration}
                                        <button onClick={() => setFilterDateExpiration("")} className="ml-0.5 hover:text-orange-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterDateFabrication && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                        Fabrication: {filterDateFabrication}
                                        <button onClick={() => setFilterDateFabrication("")} className="ml-0.5 hover:text-slate-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterMargeMin && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        Marge min: {filterMargeMin}
                                        <button onClick={() => setFilterMargeMin("")} className="ml-0.5 hover:text-emerald-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                                {filterMargeMax && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                        Marge max: {filterMargeMax}
                                        <button onClick={() => setFilterMargeMax("")} className="ml-0.5 hover:text-teal-900"><X className="h-3 w-3" /></button>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="p-4 rounded-2xl border border-border bg-card shadow-sm animate-pulse space-y-3">
                                <div className="h-6 w-24 bg-muted rounded" />
                                <div className="h-4 w-32 bg-muted rounded" />
                                <div className="h-8 w-full bg-muted rounded" />
                            </div>
                        ))
                    ) : filteredProducts.length === 0 ? (
                        <div className="col-span-full text-center py-16 border border-dashed border-border rounded-2xl bg-card">
                            <Package className="h-10 w-10 text-muted mx-auto mb-3" />
                            <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                            <p className="text-muted text-sm mt-1">Essayez un autre terme de recherche</p>
                        </div>
                    ) : (
                        paginatedProducts.map((product) => (
                            <div key={product.id} className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 overflow-hidden relative group/img">
                                            {product.photo ? (
                                                <>
                                                    <img
                                                        src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(product.photo)}`}
                                                        alt={product.nom}
                                                        className="h-full w-full object-cover cursor-zoom-in transition-opacity hover:opacity-80"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden group-hover/img:flex z-[9999] pointer-events-none items-center justify-center">
                                                        <div className="w-80 h-80 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] border-8 border-white dark:border-slate-800 p-1 animate-in fade-in zoom-in duration-300">
                                                            <img
                                                                src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(product.photo)}`}
                                                                alt={product.nom}
                                                                className="w-full h-full object-cover rounded-xl"
                                                            />
                                                            <div className="absolute -bottom-10 left-0 right-0 py-2 text-white text-sm font-bold uppercase tracking-widest text-center bg-indigo-600/90 backdrop-blur-sm rounded-lg shadow-xl">
                                                                {product.nom}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <Package className="h-5 w-5" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground text-sm">{product.nom}</p>
                                            {product.reference && <p className="text-xs text-muted-foreground">{product.reference}</p>}
                                            <p className="text-sm font-semibold text-foreground mt-1">{Number(product.prix).toFixed(2)} DH</p>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuItem onClick={() => setViewingProduct(product)} className="cursor-pointer">
                                                <ViewSvgIcon className="h-4 w-4" /> Voir
                                            </DropdownMenuItem>
                                            {canEditProducts && (
                                                <DropdownMenuItem onClick={() => handleEdit(product)} className="cursor-pointer">
                                                    <EditSvgIcon className="h-4 w-4" /> Modifier
                                                </DropdownMenuItem>
                                            )}
                                            {canDeleteProducts && (
                                                <DropdownMenuItem onClick={() => handleDelete(product.id)} className="cursor-pointer text-red-600 focus:text-red-600">
                                                    <Trash2 className="h-4 w-4" /> Supprimer
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="flex flex-wrap gap-2 text-xs">
                                    {product.category_name && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                            {product.category_name}
                                        </span>
                                    )}
                                    {product.product_type_name && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                            {product.product_type_name}
                                        </span>
                                    )}
                                    {product.point_de_vente_name && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                            <Store className="h-3.5 w-3.5" /> {product.point_de_vente_name}
                                        </span>
                                    )}
                                    {product.marque_nom && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-lime-100 text-lime-700">
                                            {product.marque_nom}
                                        </span>
                                    )}
                                    {product.fournisseur_nom && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                                            {product.fournisseur_nom}
                                        </span>
                                    )}
                                    {product.num_serie && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-zinc-100 text-zinc-700">
                                            N° série: {product.num_serie}
                                        </span>
                                    )}
                                    {product.date_fabrication && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700">
                                            Fab: {String(product.date_fabrication).slice(0, 10)}
                                        </span>
                                    )}
                                    {product.date_expiration && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                                            Exp: {String(product.date_expiration).slice(0, 10)}
                                        </span>
                                    )}
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                        Stock: {product.stock}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                                        {formatProductPrice(product)}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-cyan-50 text-cyan-700">
                                        Achat: {product.prix_achat != null ? `${Number(product.prix_achat).toFixed(2)} DH` : "—"}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700">
                                        Marge: {product.marge != null ? `${Number(product.marge).toFixed(2)} DH` : `${((Number(product.prix) || 0) - (Number(product.prix_achat) || 0)).toFixed(2)} DH`}
                                    </span>
                                    <span className={cn(
                                        "inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold",
                                        product.disponible === 0 || product.disponible === false
                                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                    )}>
                                        {product.disponible === 0 || product.disponible === false ? "Non disponible" : "Disponible"}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div>{getStockBadge(product)}</div>
                                    <div className="flex items-center gap-2">
                                        {canSellProductFromList(product) ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-3 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                                                    onClick={() =>
                                                        {
                                                            console.log("[Products][Vendre][card]", {
                                                                productId: product.id,
                                                                nom: product.nom,
                                                                targetRoute: "/dashboard/devis",
                                                            });
                                                            navigate(
                                                                "/dashboard/devis",
                                                                { state: { selectedProduct: product } }
                                                            );
                                                        }}
                                            >
                                                <ShoppingCart className="h-3.5 w-3.5" /> Vendre
                                            </Button>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/50 text-slate-400 border border-slate-200 dark:border-slate-700/50">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                <span className="text-[11px] font-black uppercase tracking-tighter">Épuisé</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {viewMode === "table" && (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-b border-border">
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Produit</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Catégorie</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Type</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Prix</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Prix d'achat</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Marge</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Marque</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Fournisseur</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">N° série</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Fabrication</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Expiration</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Stock</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Point de vente</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3">Disponibilité</TableHead>
                            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i} className="border-b border-border">
                                    {Array.from({ length: 15 }).map((_, j) => (
                                        <TableCell key={j}>
                                            <div className="h-4 bg-muted rounded animate-pulse w-24" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : filteredProducts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={15} className="text-center py-16">
                                    <Package className="h-10 w-10 text-muted mx-auto mb-3" />
                                    <p className="text-muted-foreground font-medium">Aucun produit trouvé</p>
                                    <p className="text-muted text-sm mt-1">Essayez un autre terme de recherche</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedProducts.map((product) => (
                                <TableRow key={product.id} className="group border-b border-border hover:bg-muted/30 transition-colors">
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400 relative group/img">
                                                {product.photo ? (
                                                    <>
                                                        <img
                                                            src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(product.photo)}`}
                                                            alt={product.nom}
                                                            className="h-9 w-9 object-cover rounded-lg cursor-zoom-in transition-opacity hover:opacity-80"
                                                            onError={(e) => {
                                                                const t = e.target as HTMLImageElement;
                                                                t.style.display = "none";
                                                            }}
                                                        />
                                                        {/* High-end Zoom Preview - Fixed position to avoid clipping */}
                                                        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden group-hover/img:flex z-[9999] pointer-events-none items-center justify-center">
                                                            <div className="w-80 h-80 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] border-8 border-white dark:border-slate-800 p-1 animate-in fade-in zoom-in duration-300">
                                                                <img
                                                                    src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(product.photo)}`}
                                                                    alt={product.nom}
                                                                    className="w-full h-full object-cover rounded-xl"
                                                                />
                                                                <div className="absolute -bottom-10 left-0 right-0 py-2 text-white text-sm font-bold uppercase tracking-widest text-center bg-indigo-600/90 backdrop-blur-sm rounded-lg shadow-xl">
                                                                    {product.nom}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <Package className="h-4 w-4" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground text-sm">{product.nom}</p>
                                                {product.reference && <p className="text-xs text-muted-foreground">{product.reference}</p>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {product.category_name ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                                {product.category_name}
                                            </span>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        {product.product_type_name ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                {product.product_type_name}
                                            </span>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-semibold text-foreground text-sm">
                                            {formatProductPrice(product)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-semibold text-foreground text-sm">
                                            {product.prix_achat != null ? `${Number(product.prix_achat).toFixed(2)} DH` : "—"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-semibold text-foreground text-sm">
                                            {product.marge != null ? `${Number(product.marge).toFixed(2)} DH` : "—"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {product.marque_nom ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-lime-100 text-lime-700">
                                                {product.marque_nom}
                                            </span>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        {product.fournisseur_nom ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                {product.fournisseur_nom}
                                            </span>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-foreground">
                                            {product.num_serie || "—"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-foreground">
                                            {product.date_fabrication ? String(product.date_fabrication).slice(0, 10) : "—"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-foreground">
                                            {product.date_expiration ? String(product.date_expiration).slice(0, 10) : "—"}
                                        </span>
                                    </TableCell>
                                    <TableCell>{getStockBadge(product)}</TableCell>
                                    <TableCell>
                                        {product.point_de_vente_name ? (
                                            <span className="inline-flex items-center gap-1 text-sm text-foreground">
                                                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                                {product.point_de_vente_name}
                                            </span>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        {product.disponible === 0 || product.disponible === false ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                                Non disponible
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                Disponible
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {!canSellProductFromList(product) && (
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700/50 grayscale">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    <span className="text-[11px] font-black uppercase tracking-tighter">Épuisé</span>
                                                </div>
                                            )}
                                            {canSellProductFromList(product) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-3 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                                                    onClick={() =>
                                                        {
                                                            console.log("[Products][Vendre][table]", {
                                                                productId: product.id,
                                                                nom: product.nom,
                                                                targetRoute: "/dashboard/devis",
                                                            });
                                                            navigate(
                                                                "/dashboard/devis",
                                                                { state: { selectedProduct: product } }
                                                            );
                                                        }}
                                                >
                                                    <ShoppingCart className="h-3.5 w-3.5" />
                                                    Vendre
                                                </Button>
                                            )}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                                        aria-label="Actions"
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem
                                                        onClick={() => setViewingProduct(product)}
                                                        className="cursor-pointer"
                                                    >
                                                        <ViewSvgIcon className="h-4 w-4" />
                                                        Voir
                                                    </DropdownMenuItem>
                                                    {canEditProducts && (
                                                        <DropdownMenuItem
                                                            onClick={() => handleEdit(product)}
                                                            className="cursor-pointer"
                                                        >
                                                            <EditSvgIcon className="h-4 w-4" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                    )}
                                                    {canDeleteProducts && (
                                                        <DropdownMenuItem
                                                            onClick={() => handleDelete(product.id)}
                                                            variant="destructive"
                                                            className="cursor-pointer text-red-600 focus:text-red-600"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            Supprimer
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            )}

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 bg-card border-t border-border rounded-b-xl shadow-sm">
                    <div className="text-sm text-muted-foreground font-medium">
                        Affichage de <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> à <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> sur <span className="text-foreground font-bold">{filteredProducts.length}</span> produits
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="icon"
                                        className={cn(
                                            "h-9 w-9 transition-all duration-300 active:scale-95",
                                            currentPage === pageNum
                                                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-none font-bold"
                                                : "border-border hover:bg-muted hover:text-indigo-600"
                                        )}
                                        onClick={() => setCurrentPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-border hover:bg-muted hover:text-indigo-600 transition-all active:scale-95"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Le produit sera définitivement supprimé.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Import Warning */}
            <AlertDialog open={isImportWarningOpen} onOpenChange={setIsImportWarningOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Import produits</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous devez télécharger d'abord notre fichier exemplaire avant de lancer un import.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={downloadImportSample}>
                            Télécharger le fichier exemplaire
                        </Button>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleContinueImport} className="bg-indigo-600 hover:bg-indigo-700">
                            Continuer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Import Type Selection */}
            <Dialog open={isImportTypeDialogOpen} onOpenChange={setIsImportTypeDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Choisir le type de fichier</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() => handleImportTypeSelect("csv")}
                        >
                            Import CSV
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onClick={() => handleImportTypeSelect("excel")}
                        >
                            Import Excel
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Dialog */}
            <Dialog open={!!viewingProduct} onOpenChange={(open) => !open && setViewingProduct(null)}>
                <DialogContent className="w-[95vw] max-w-3xl h-[85vh] max-h-[85vh] overflow-hidden p-0 flex flex-col">
                    <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            Détails du produit
                        </DialogTitle>
                    </DialogHeader>
                    {viewingProduct && (
                        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex items-center justify-center bg-muted rounded-xl p-6 border border-border">
                                {viewingProduct.photo ? (
                                    (() => {
                                        const imgUrl = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/uploads/${encodeURIComponent(viewingProduct.photo)}`;
                                        return (
                                    <img
                                            src={imgUrl}
                                        alt={viewingProduct.nom}
                                            className="max-h-70 object-contain rounded-lg shadow-sm transition-transform duration-300 hover:scale-110 cursor-zoom-in"
                                            onClick={() => setZoomImageUrl(imgUrl)}
                                        onError={(e) => {
                                            const t = e.target as HTMLImageElement;
                                            t.src = "https://placehold.co/400x400?text=No+Image";
                                        }}
                                    />
                                        );
                                    })()
                                ) : (
                                    <div className="text-center text-muted-foreground">
                                        <Package className="h-16 w-16 mx-auto mb-2 opacity-20" />
                                        <p className="text-sm">Aucune image</p>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">{viewingProduct.nom}</h3>
                                    <p className="text-sm text-muted-foreground">{viewingProduct.reference || "Aucune référence"}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(() => {
                                        return [
                                            {
                                                label: "Prix",
                                                value: formatProductPrice(viewingProduct),
                                            },
                                            {
                                                label: "Prix d'achat",
                                                value: viewingProduct.prix_achat != null ? `${Number(viewingProduct.prix_achat).toFixed(2)} DH` : "—",
                                            },
                                            {
                                                label: "Marge",
                                                value: viewingProduct.marge != null ? `${Number(viewingProduct.marge).toFixed(2)} DH` : "—",
                                            },
                                            { label: "Stock", value: viewingProduct.stock.toString() },
                                            {
                                                label: "Alerte stock",
                                                value: viewingProduct.stock_alert?.toString() || "—",
                                            },
                                            { label: "Catégorie", value: viewingProduct.category_name || "—" },
                                            { label: "Type", value: viewingProduct.product_type_name || "—" },
                                            { label: "Marque", value: viewingProduct.marque_nom || "—" },
                                            { label: "Fournisseur", value: viewingProduct.fournisseur_nom || "—" },
                                            { label: "N° série", value: viewingProduct.num_serie || "—" },
                                            { label: "Expiration", value: viewingProduct.date_expiration ? String(viewingProduct.date_expiration).slice(0, 10) : "—" },
                                            { label: "Fabrication", value: viewingProduct.date_fabrication ? String(viewingProduct.date_fabrication).slice(0, 10) : "—" },
                                            { label: "Point de vente", value: viewingProduct.point_de_vente_name || "—" },
                                            { label: "Disponibilité", value: viewingProduct.disponible === 0 || viewingProduct.disponible === false ? "Non disponible" : "Disponible" },
                                        ];
                                    })().map(({ label, value }) => (
                                        <div key={label} className="bg-muted rounded-lg p-3">
                                            <p className="text-xs text-muted-foreground font-medium">{label}</p>
                                            <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Code Barre Section */}
                                {viewingProduct.code_barre && (
                                    <div className="bg-muted rounded-lg p-4">
                                        <p className="text-xs text-muted-foreground font-medium mb-3">Code Barre</p>
                                        <div className="bg-card p-4 rounded-lg border border-border flex flex-col items-center gap-2">
                                            <canvas
                                                ref={viewBarcodeCanvasRef}
                                                className="max-w-full h-auto border border-border rounded"
                                                width="300"
                                                height="100"
                                                style={{ maxHeight: '100px' }}
                                            />
                                            <p className="text-sm font-mono text-foreground bg-muted px-3 py-1 rounded">
                                                {viewingProduct.code_barre}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {viewingProduct.description && (
                                    <div className="bg-muted rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{viewingProduct.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Barcode / QR Scanner Dialog */}
            <Dialog open={isScannerDialogOpen} onOpenChange={setIsScannerDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none">
                    <DialogHeader className="p-6 bg-indigo-600 text-white shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <Camera className="h-6 w-6" />
                            Scanner un produit
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
                        <div className="relative aspect-square w-full bg-black rounded-xl overflow-hidden shadow-inner border-2 border-indigo-100 dark:border-indigo-800">
                            <div id="reader" className="w-full h-full [&>video]:object-cover"></div>
                            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none flex items-center justify-center">
                                <div className="w-full h-full border-2 border-indigo-400 rounded-lg animate-pulse" />
                            </div>
                        </div>
                        <div className="text-center space-y-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">Placez le code QR ou barre au centre</p>
                            <p className="text-xs text-slate-500">La détection est automatique</p>
                        </div>
                        <Button 
                            variant="outline" 
                            className="w-full rounded-xl"
                            onClick={() => setIsScannerDialogOpen(false)}
                        >
                            Fermer la caméra
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Fullscreen image viewer (au-dessus du dialog) */}
            {zoomImageUrl && (
                <div
                    className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setZoomImageUrl(null)}
                >
                    <img
                        src={zoomImageUrl}
                        alt="Produit"
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl border border-white/10 bg-black"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
