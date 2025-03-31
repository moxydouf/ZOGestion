document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Application chargée !");
    remplirSelectAnnee();
    remplirSelectLogement();
    chargerReservations();
    initExcelImport();
});

// Variables globales pour la gestion de l'import Excel
// Variables globales
let importedExcelData = [];
let currentExcelIndex = -1;
let isOnline = navigator.onLine;
let syncInProgress = false;

// Écouteur de statut réseau
window.addEventListener('online', () => {
    isOnline = true;
    checkAndSync();
    console.log("Connecté à Internet - Synchronisation activée");
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log("Mode hors ligne - Utilisation des données locales");
});

// Initialisation
document.addEventListener("DOMContentLoaded", async () => {
    console.log("✅ Application chargée !");
    await initAuth();
    remplirSelectAnnee();
    remplirSelectLogement();
    await chargerReservations();
    initExcelImport();
    checkAndSync();
});

// Authentification
async function initAuth() {
    try {
        await auth.signInAnonymously();
        console.log("Authentifié anonymement avec Firebase");
    } catch (error) {
        console.error("Erreur d'authentification:", error);
    }
}

// Fonction de synchronisation
async function checkAndSync() {
    if (!isOnline || syncInProgress) return;
    
    syncInProgress = true;
    console.log("Début de la synchronisation...");
    
    try {
        // 1. Récupérer les données locales non synchronisées
        const localReservations = JSON.parse(localStorage.getItem("reservations")) || [];
        const unsynced = localReservations.filter(r => !r.synced);
        
        // 2. Envoyer les données non synchronisées
        const batch = db.batch();
        const reservationsRef = db.collection("reservations");
        
        unsynced.forEach(res => {
            const newRef = reservationsRef.doc();
            batch.set(newRef, {
                ...res,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                synced: true
            });
            res.firebaseId = newRef.id; // Stocker l'ID Firebase localement
        });
        
        await batch.commit();
        
        // 3. Mettre à jour le statut local
        localReservations.forEach(r => r.synced = true);
        localStorage.setItem("reservations", JSON.stringify(localReservations));
        
        // 4. Récupérer les données du serveur
        const snapshot = await reservationsRef
            .orderBy("lastUpdated", "desc")
            .get();
            
        const serverData = snapshot.docs.map(doc => ({
            firebaseId: doc.id,
            ...doc.data()
        }));
        
        // 5. Fusionner les données
        const merged = mergeReservations(localReservations, serverData);
        localStorage.setItem("reservations", JSON.stringify(merged));
        
        console.log("Synchronisation réussie !");
        chargerReservations();
    } catch (error) {
        console.error("Erreur de synchronisation:", error);
    } finally {
        syncInProgress = false;
    }
}

function mergeReservations(local, server) {
    const merged = [...local];
    
    server.forEach(serverRes => {
        const existingIndex = merged.findIndex(r => r.firebaseId === serverRes.firebaseId);
        
        if (existingIndex === -1) {
            // Nouvelle réservation du serveur
            merged.push(serverRes);
        } else {
            // Conflit - on garde la version la plus récente
            const localRes = merged[existingIndex];
            const serverDate = serverRes.lastUpdated?.toDate() || new Date(0);
            const localDate = new Date(localRes.lastUpdated || 0);
            
            if (serverDate > localDate) {
                merged[existingIndex] = serverRes;
            }
        }
    });
    
    return merged;
}

// Modifié: sauvegarderReservation
async function sauvegarderReservation(prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, 
                              logement, emplacement, photoCin, photoPasseport) {
    const reservation = { 
        prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, 
        logement, emplacement, photoCin, photoPasseport,
        lastUpdated: new Date().toISOString(),
        synced: false
    };
    
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    reservations.push(reservation);
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    if (isOnline) {
        try {
            const docRef = await db.collection("reservations").add({
                ...reservation,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                synced: true
            });
            
            reservation.firebaseId = docRef.id;
            reservation.synced = true;
            localStorage.setItem("reservations", JSON.stringify(reservations));
        } catch (error) {
            console.error("Erreur de sauvegarde en ligne:", error);
        }
    }
    
    chargerReservations();
    document.getElementById("reservation-form").reset();
    remplirSelectLogement();
}

// Modifié: chargerReservations
async function chargerReservations() {
    let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    // Si en ligne, vérifier les mises à jour
    if (isOnline && !syncInProgress) {
        await checkAndSync();
        reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    }
    
    const list = document.getElementById("reservation-list");
    list.innerHTML = "";

    reservations.forEach((res, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${res.prenom}</td>
            <td>${res.nom}</td>
            <td>${res.dateDebut} → ${res.dateFin}</td>
            <td>${res.duree}</td>
            <td>${res.prix.toFixed(2)} DH</td>
            <td>${res.photoCin === "Pas de photo" ? "Pas de photo" : `<img src="${res.photoCin}" alt="Photo CIN" width="50">`}</td>
            <td>${res.photoPasseport === "Pas de photo" ? "Pas de photo" : `<img src="${res.photoPasseport}" alt="Photo Passeport" width="50">`}</td>
            <td>${res.logement}</td>
            <td>${res.emplacement}</td>
            <td><button class="supprimer-btn" data-index="${index}">🗑</button></td>
        `;
        list.appendChild(tr);
    });

    document.querySelectorAll(".supprimer-btn").forEach(button => {
        button.addEventListener("click", async (event) => {
            await supprimerReservation(event.target.dataset.index);
        });
    });

    mettreAJourTotaux();
}

// Modifié: supprimerReservation
async function supprimerReservation(index) {
    let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    const reservation = reservations[index];
    
    // Supprimer en ligne si connecté
    if (isOnline && reservation.firebaseId) {
        try {
            await db.collection("reservations").doc(reservation.firebaseId).delete();
        } catch (error) {
            console.error("Erreur de suppression en ligne:", error);
        }
    }
    
    // Supprimer localement
    reservations.splice(index, 1);
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    chargerReservations();
    remplirSelectLogement();
}

// Le reste des fonctions (mettreAJourTotaux, export PDF, etc.) reste identique
// mais utilise maintenant les données synchronisées

function mettreAJourTotaux() {
    let totalMensuel = 0;
    let totalAnnuel = 0;
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    const moisActuel = new Date().getMonth();
    const anneeActuelle = new Date().getFullYear();

    reservations.forEach(res => {
        const dateDebut = new Date(res.dateDebut);
        const prix = parseFloat(res.prix);
        
        if (dateDebut.getFullYear() === anneeActuelle) {
            totalAnnuel += prix;
            if (dateDebut.getMonth() === moisActuel) {
                totalMensuel += prix;
            }
        }
    });

    document.getElementById("total-mensuel").textContent = `${totalMensuel.toFixed(2)} DH`;
    document.getElementById("total-annuel").textContent = `${totalAnnuel.toFixed(2)} DH`;
}

// Gestion de l'import Excel
function initExcelImport() {
    const dropzone = document.getElementById('excel-dropzone');
    const fileInput = document.getElementById('excel-file');
    const preview = document.getElementById('excel-preview');
    const loading = document.getElementById('excel-loading');
    const success = document.getElementById('excel-success');
    const confirmBtn = document.getElementById('excel-confirm');
    const cancelBtn = document.getElementById('excel-cancel');
    const prevBtn = document.getElementById('excel-prev');
    const nextBtn = document.getElementById('excel-next');
    const progressIndicator = document.getElementById('progress-indicator');
    
    // Événements pour le drag and drop
    dropzone.addEventListener('click', () => fileInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('active');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('active');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('active');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFileUpload(fileInput.files[0]);
        }
    });
    
    // Boutons de navigation
    confirmBtn.addEventListener('click', fillCurrentEntry);
    cancelBtn.addEventListener('click', resetImport);
    prevBtn.addEventListener('click', showPreviousEntry);
    nextBtn.addEventListener('click', showNextEntry);
}

function handleFileUpload(file) {
    const loading = document.getElementById('excel-loading');
    const preview = document.getElementById('excel-preview');
    const success = document.getElementById('excel-success');
    
    loading.classList.add('active');
    preview.innerHTML = '';
    success.classList.remove('active');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error("Aucune feuille trouvée dans le fichier Excel");
            }
            
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            importedExcelData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
            
            if (!importedExcelData || importedExcelData.length === 0) {
                throw new Error("Aucune donnée valide trouvée dans la feuille");
            }

            currentExcelIndex = 0;
            updateUI();
            showPreview(importedExcelData);
            
            document.getElementById('import-count').textContent = 
                `${importedExcelData.length} entrées chargées`;

        } catch (error) {
            console.error("Erreur lors de l'import:", error);
            preview.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
        } finally {
            loading.classList.remove('active');
            preview.style.display = 'block';
        }
    };
    reader.onerror = function() {
        loading.classList.remove('active');
        preview.innerHTML = '<p class="error">Erreur de lecture du fichier</p>';
    };
    reader.readAsArrayBuffer(file);
}

function showPreview(data) {
    const preview = document.getElementById('excel-preview');
    preview.innerHTML = '';
    
    if (!data || data.length === 0) {
        preview.innerHTML = '<p>Aucune donnée à afficher</p>';
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Création des en-têtes
    const headerRow = document.createElement('tr');
    Object.keys(data[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Création des lignes de données
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        if (index === currentExcelIndex) {
            tr.classList.add('current-row');
        }
        
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value !== undefined && value !== null ? value : '';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    
    table.appendChild(thead);
    table.appendChild(tbody);
    preview.appendChild(table);
}

function updateUI() {
    const prevBtn = document.getElementById('excel-prev');
    const nextBtn = document.getElementById('excel-next');
    const progressIndicator = document.getElementById('progress-indicator');
    
    if (importedExcelData && importedExcelData.length > 0) {
        prevBtn.disabled = currentExcelIndex <= 0;
        nextBtn.disabled = currentExcelIndex >= importedExcelData.length - 1;
        progressIndicator.textContent = `Entrée ${currentExcelIndex + 1}/${importedExcelData.length}`;
        document.getElementById('excel-success').classList.add('active');
    } else {
        progressIndicator.textContent = "Entrée 0/0";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
    }
}

function fillCurrentEntry() {
    if (currentExcelIndex < 0 || currentExcelIndex >= importedExcelData.length) return;
    
    const entry = importedExcelData[currentExcelIndex];
    const fieldMap = {
        'Prénom': 'prenom',
        'Nom': 'nom',
        'CIN': 'cin',
        'Téléphone': 'telephone',
        'Date début': 'date-debut',
        'Date fin': 'date-fin',
        'Prix': 'prix',
        'Logement': 'logement',
        'Emplacement': 'emplacement'
    };

    // Reset le formulaire avant de remplir avec les nouvelles données
    document.getElementById("reservation-form").reset();

    Object.entries(fieldMap).forEach(([excelKey, formId]) => {
        const field = document.getElementById(formId);
        if (field && entry[excelKey] !== undefined && entry[excelKey] !== null) {
            field.value = entry[excelKey];
            field.classList.add('field-highlight');
            setTimeout(() => field.classList.remove('field-highlight'), 1000);
        }
    });
    
    // Calcul automatique de la durée si les dates sont présentes
    if (entry['Date début'] && entry['Date fin']) {
        const debut = new Date(entry['Date début']);
        const fin = new Date(entry['Date fin']);
        if (!isNaN(debut.getTime()) && !isNaN(fin.getTime())) {
            const duree = Math.ceil((fin - debut) / (1000 * 60 * 60 * 24));
            document.getElementById('duree').textContent = duree > 0 ? `${duree} jours` : '0 jour';
        }
    }
}

function showNextEntry() {
    if (currentExcelIndex < importedExcelData.length - 1) {
        currentExcelIndex++;
        updateUI();
        fillCurrentEntry();
        scrollToCurrentRow();
    }
}

function showPreviousEntry() {
    if (currentExcelIndex > 0) {
        currentExcelIndex--;
        updateUI();
        fillCurrentEntry();
        scrollToCurrentRow();
    }
}

function scrollToCurrentRow() {
    const preview = document.getElementById('excel-preview');
    const currentRow = preview.querySelector('.current-row');
    if (currentRow) {
        currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function resetImport() {
    importedExcelData = [];
    currentExcelIndex = -1;
    document.getElementById('excel-file').value = '';
    document.getElementById('excel-preview').innerHTML = '';
    document.getElementById('excel-loading').classList.remove('active');
    document.getElementById('excel-success').classList.remove('active');
    document.getElementById('progress-indicator').textContent = 'Entrée 0/0';
    document.getElementById('excel-prev').disabled = true;
    document.getElementById('excel-next').disabled = true;
}

// Export PDF
document.getElementById("export-pdf-annee").addEventListener("click", () => {
    const selectedYear = parseInt(document.getElementById("select-year").value);
    exporterPDF(selectedYear);
});

document.getElementById("export-pdf-mois").addEventListener("click", () => {
    const selectedYear = parseInt(document.getElementById("select-year").value);
    const selectedMonth = parseInt(document.getElementById("select-month").value);
    exporterPDFMois(selectedYear, selectedMonth);
});

function exporterPDF(annee) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
        const selectedLogement = document.getElementById("select-logement").value;

        reservations = reservations.filter(res => {
            try {
                const dateRes = new Date(res.dateDebut);
                return dateRes.getFullYear() === annee && 
                       (selectedLogement === "tous" || res.logement === selectedLogement);
            } catch (e) {
                console.error("Erreur de date :", e);
                return false;
            }
        });

        if (reservations.length === 0) {
            alert("Aucune donnée à exporter pour les critères sélectionnés");
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Détail des Réservations", pageWidth / 2, 15, { align: 'center' });
        
        doc.setFontSize(12);
        const sousTitre = selectedLogement === "tous" 
            ? `Année ${annee} - Tous les logements`
            : `Année ${annee} - Logement: ${selectedLogement}`;
        doc.text(sousTitre, pageWidth / 2, 25, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100);
        const aujourdHui = new Date().toLocaleDateString('fr-FR');
        doc.text(`Édité le: ${aujourdHui}`, pageWidth - margin, 35, { align: 'right' });

        const headers = [
            ["#", "Client", "CIN", "Téléphone", "Logement", "Emplacement", 
             "Période", "Durée", "Prix (DH)", "Photo CIN", "Photo Passeport"]
        ];

        const data = reservations.map((res, index) => [
            index + 1,
            `${res.prenom} ${res.nom}`,
            res.cin,
            res.telephone,
            res.logement,
            res.emplacement,
            `${res.dateDebut} au ${res.dateFin}`,
            res.duree,
            res.prix.toFixed(2),
            res.photoCin === "Pas de photo" ? "Non" : "Oui",
            res.photoPasseport === "Pas de photo" ? "Non" : "Oui"
        ]);

        doc.autoTable({
            startY: 40,
            head: headers,
            body: data,
            margin: { horizontal: margin },
            styles: { 
                fontSize: 8,
                cellPadding: 3,
                overflow: 'linebreak'
            },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 25 },
                2: { cellWidth: 20 },
                3: { cellWidth: 20 },
                4: { cellWidth: 25 },
                5: { cellWidth: 25 },
                6: { cellWidth: 30 },
                7: { cellWidth: 15 },
                8: { cellWidth: 15 },
                9: { cellWidth: 15 },
                10: { cellWidth: 15 }
            },
            didDrawPage: function(data) {
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(
                    `Page ${data.pageNumber}`,
                    pageWidth / 2,
                    doc.internal.pageSize.getHeight() - 10,
                    { align: 'center' }
                );
            }
        });

        const total = reservations.reduce((sum, res) => sum + res.prix, 0);
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(
            `Total: ${total.toFixed(2)} DH`,
            pageWidth - margin,
            doc.lastAutoTable.finalY + 10,
            { align: 'right' }
        );

        const nomFichier = selectedLogement === "tous" 
            ? `reservations_completes_${annee}.pdf` 
            : `reservations_${selectedLogement}_${annee}.pdf`;
        
        doc.save(nomFichier);

    } catch (error) {
        console.error("Erreur d'export PDF :", error);
        alert("Échec de l'export : " + error.message);
    }
}

function exporterPDFMois(annee, mois) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        
        let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
        const selectedLogement = document.getElementById("select-logement").value;
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
                         "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

        reservations = reservations.filter(res => {
            try {
                const dateRes = new Date(res.dateDebut);
                return dateRes.getFullYear() === annee && 
                       dateRes.getMonth() === mois &&
                       (selectedLogement === "tous" || res.logement === selectedLogement);
            } catch (e) {
                console.error("Erreur de date :", e);
                return false;
            }
        });

        if (reservations.length === 0) {
            alert(`Aucune réservation pour ${moisNoms[mois]} ${annee}`);
            return;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Détail des Réservations", pageWidth / 2, 15, { align: 'center' });
        
        doc.setFontSize(12);
        const sousTitre = selectedLogement === "tous" 
            ? `${moisNoms[mois]} ${annee} - Tous les logements`
            : `${moisNoms[mois]} ${annee} - Logement: ${selectedLogement}`;
        doc.text(sousTitre, pageWidth / 2, 25, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100);
        const aujourdHui = new Date().toLocaleDateString('fr-FR');
        doc.text(`Édité le: ${aujourdHui}`, pageWidth - margin, 35, { align: 'right' });

        const headers = [
            ["#", "Client", "CIN", "Téléphone", "Logement", "Emplacement", 
             "Période", "Durée", "Prix (DH)", "Photo CIN", "Photo Passeport"]
        ];

        const data = reservations.map((res, index) => [
            index + 1,
            `${res.prenom} ${res.nom}`,
            res.cin,
            res.telephone,
            res.logement,
            res.emplacement,
            `${formatDateForExport(res.dateDebut)} au ${formatDateForExport(res.dateFin)}`,
            res.duree,
            res.prix.toFixed(2),
            res.photoCin === "Pas de photo" ? "Non" : "Oui",
            res.photoPasseport === "Pas de photo" ? "Non" : "Oui"
        ]);

        doc.autoTable({
            startY: 40,
            head: headers,
            body: data,
            margin: { horizontal: margin },
            styles: { 
                fontSize: 9,
                cellPadding: 4,
                overflow: 'linebreak',
                halign: 'left'
            },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 30 },
                2: { cellWidth: 25 },
                3: { cellWidth: 25 },
                4: { cellWidth: 25 },
                5: { cellWidth: 25 },
                6: { cellWidth: 40 },
                7: { cellWidth: 20 },
                8: { cellWidth: 20 },
                9: { cellWidth: 20 },
                10: { cellWidth: 20 }
            },
            didDrawPage: function(data) {
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(
                    `Page ${data.pageNumber}`,
                    pageWidth / 2,
                    doc.internal.pageSize.getHeight() - 10,
                    { align: 'center' }
                );
            }
        });

        const total = reservations.reduce((sum, res) => sum + res.prix, 0);
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(
            `Total: ${total.toFixed(2)} DH`,
            pageWidth - margin,
            doc.lastAutoTable.finalY + 10,
            { align: 'right' }
        );

        const nomFichier = selectedLogement === "tous" 
            ? `reservations_${moisNoms[mois]}_${annee}.pdf`
            : `reservations_${selectedLogement}_${moisNoms[mois]}_${annee}.pdf`;
        
        doc.save(nomFichier);

    } catch (error) {
        console.error("Erreur d'export PDF :", error);
        alert("Échec de l'export : " + error.message);
    }
}

function formatDateForExport(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}
// Gestion de l'affichage du statut de connexion
function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    
    if (isOnline) {
        statusElement.className = 'connection-status online';
        statusElement.innerHTML = `
            <i class="fas fa-wifi"></i>
            <span>En ligne</span>
            ${syncInProgress ? '<div class="sync-spinner"></div>' : ''}
        `;
    } else {
        statusElement.className = 'connection-status offline';
        statusElement.innerHTML = `
            <i class="fas fa-wifi-slash"></i>
            <span>Hors ligne</span>
        `;
    }
}

// Appelez cette fonction quand le statut change
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Modifiez checkAndSync pour mettre à jour l'UI
async function checkAndSync() {
    if (!isOnline || syncInProgress) return;
    
    syncInProgress = true;
    updateConnectionStatus();
    // ... reste du code de synchronisation ...
    syncInProgress = false;
    updateConnectionStatus();
}