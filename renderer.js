document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Application chargée !");
    remplirSelectAnnee();
    remplirSelectLogement();
    chargerReservations();
});
function remplirSelectAnnee() {
    const selectYear = document.getElementById("select-year");
    const currentYear = new Date().getFullYear();
    selectYear.innerHTML = '';
    
    for (let i = currentYear - 2; i <= currentYear + 1; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        selectYear.appendChild(option);
    }
    selectYear.value = currentYear;
}

function remplirSelectLogement() {
    const selectLogement = document.getElementById("select-logement");
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    // Reset et option par défaut
    selectLogement.innerHTML = '<option value="tous">Tous les logements</option>';
    
    // Récupérer les logements uniques
    const logementsUniques = [...new Set(reservations.map(r => r.logement).filter(Boolean))];
    
    // Ajouter les options
    logementsUniques.forEach(logement => {
        const option = document.createElement("option");
        option.value = logement;
        option.textContent = logement;
        selectLogement.appendChild(option);
    });
    
    // Mettre à jour le compteur dans l'onglet Stats
    document.getElementById("total-logements").textContent = logementsUniques.length;
}


// Gestion des réservations
document.getElementById("reservation-form").addEventListener("submit", (event) => {
    event.preventDefault();

    // Récupération des valeurs
    const prenom = document.getElementById("prenom").value.trim();
    const nom = document.getElementById("nom").value.trim();
    const cin = document.getElementById("cin").value.trim();
    const telephone = document.getElementById("telephone").value.trim();
    const dateDebut = document.getElementById("date-debut").value;
    const dateFin = document.getElementById("date-fin").value;
    const prix = parseFloat(document.getElementById("prix").value);
    const logement = document.getElementById("logement").value.trim();
    const emplacement = document.getElementById("emplacement").value.trim();

    // Validation
    if (!prenom || !nom || !cin || !telephone || !dateDebut || !dateFin || isNaN(prix) || !logement || !emplacement) {
        alert("Veuillez remplir tous les champs !");
        return;
    }

    // Calcul durée
    const debut = new Date(dateDebut);
    const fin = new Date(dateFin);
    let duree = Math.ceil((fin - debut) / (1000 * 60 * 60 * 24)) + " jours";
    if (duree < 0) {
        alert("La durée ne peut pas être négative.");
        return;
    }

    // Gestion photo
    const fichierPhoto = document.getElementById("photo").files[0];
    if (fichierPhoto) {
        const reader = new FileReader();
        reader.readAsDataURL(fichierPhoto);
        reader.onload = () => {
            sauvegarderReservation(prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, logement, emplacement, reader.result);
        };
    } else {
        sauvegarderReservation(prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, logement, emplacement, "Pas de photo");
    }
});

function sauvegarderReservation(prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, logement, emplacement, photo) {
    const reservation = { prenom, nom, cin, telephone, dateDebut, dateFin, duree, prix, logement, emplacement, photo };
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    reservations.push(reservation);
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    // Mettre à jour l'interface
    chargerReservations();
    document.getElementById("reservation-form").reset();
    remplirSelectLogement(); // Cette ligne va maintenant aussi mettre à jour le compteur
}

function chargerReservations() {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
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
            <td>${res.photo === "Pas de photo" ? "Pas de photo" : `<img src="${res.photo}" alt="Photo" width="50">`}</td>
            <td>${res.logement}</td>
            <td>${res.emplacement}</td>
            <td><button class="supprimer-btn" data-index="${index}">🗑</button></td>
        `;
        list.appendChild(tr);
    });

    document.querySelectorAll(".supprimer-btn").forEach(button => {
        button.addEventListener("click", (event) => {
            supprimerReservation(event.target.dataset.index);
        });
    });

    mettreAJourTotaux();
}

function supprimerReservation(index) {
    let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    reservations.splice(index, 1);
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    // Mettre à jour l'interface
    chargerReservations();
    remplirSelectLogement(); // Mise à jour du compteur
}

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

    document.getElementById("total-mensuel").textContent = `Total mensuel : ${totalMensuel.toFixed(2)} DH`;
    document.getElementById("total-annuel").textContent = `Total annuel : ${totalAnnuel.toFixed(2)} DH`;
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
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("La bibliothèque jsPDF n'est pas chargée");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
        const selectedLogement = document.getElementById("select-logement").value;

        // Filtrage
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

        // Configuration du PDF
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        // Titre principal
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Détail des Réservations", pageWidth / 2, 15, { align: 'center' });
        
        // Sous-titre
        doc.setFontSize(12);
        const sousTitre = selectedLogement === "tous" 
            ? `Année ${annee} - Tous les logements`
            : `Année ${annee} - Logement: ${selectedLogement}`;
        doc.text(sousTitre, pageWidth / 2, 25, { align: 'center' });

        // Date d'édition
        doc.setFontSize(10);
        doc.setTextColor(100);
        const aujourdHui = new Date().toLocaleDateString('fr-FR');
        doc.text(`Édité le: ${aujourdHui}`, pageWidth - margin, 35, { align: 'right' });

        // En-têtes du tableau
        const headers = [
            ["#", "Client", "CIN", "Téléphone", "Logement", "Emplacement", 
             "Période", "Durée", "Prix (DH)", "Photo CIN"]
        ];

        // Données du tableau
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
            res.photo === "Pas de photo" ? "Non" : "Oui"
        ]);

        // Génération du tableau
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
                0: { cellWidth: 8 },  // #
                1: { cellWidth: 25 }, // Client
                2: { cellWidth: 20 }, // CIN
                3: { cellWidth: 20 }, // Téléphone
                4: { cellWidth: 25 }, // Logement
                5: { cellWidth: 25 }, // Emplacement
                6: { cellWidth: 30 }, // Période
                7: { cellWidth: 15 }, // Durée
                8: { cellWidth: 15 }, // Prix
                9: { cellWidth: 15 }  // Photo
            },
            didDrawPage: function(data) {
                // Pied de page
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

        // Calcul et affichage du total
        const total = reservations.reduce((sum, res) => sum + res.prix, 0);
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(
            `Total: ${total.toFixed(2)} DH`,
            pageWidth - margin,
            doc.lastAutoTable.finalY + 10,
            { align: 'right' }
        );

        // Nom du fichier
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
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("La bibliothèque jsPDF n'est pas chargée");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let reservations = JSON.parse(localStorage.getItem("reservations")) || [];
        const selectedLogement = document.getElementById("select-logement").value;
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
                         "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

        // Filtrage
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

        // Configuration du PDF
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        // Titre principal
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Détail des Réservations", pageWidth / 2, 15, { align: 'center' });
        
        // Sous-titre
        doc.setFontSize(12);
        const sousTitre = selectedLogement === "tous" 
            ? `${moisNoms[mois]} ${annee} - Tous les logements`
            : `${moisNoms[mois]} ${annee} - Logement: ${selectedLogement}`;
        doc.text(sousTitre, pageWidth / 2, 25, { align: 'center' });

        // Date d'édition
        doc.setFontSize(10);
        doc.setTextColor(100);
        const aujourdHui = new Date().toLocaleDateString('fr-FR');
        doc.text(`Édité le: ${aujourdHui}`, pageWidth - margin, 35, { align: 'right' });

        // En-têtes du tableau
        const headers = [
            ["#", "Client", "CIN", "Téléphone", "Logement", "Emplacement", 
             "Période", "Durée", "Prix (DH)", "Photo CIN"]
        ];

        // Données du tableau
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
            res.photo === "Pas de photo" ? "Non" : "Oui"
        ]);

        // Génération du tableau
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
                0: { cellWidth: 8 },  // #
                1: { cellWidth: 25 }, // Client
                2: { cellWidth: 20 }, // CIN
                3: { cellWidth: 20 }, // Téléphone
                4: { cellWidth: 25 }, // Logement
                5: { cellWidth: 25 }, // Emplacement
                6: { cellWidth: 30 }, // Période
                7: { cellWidth: 15 }, // Durée
                8: { cellWidth: 15 }, // Prix
                9: { cellWidth: 15 }  // Photo
            },
            didDrawPage: function(data) {
                // Pied de page
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

        // Calcul et affichage du total
        const total = reservations.reduce((sum, res) => sum + res.prix, 0);
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(
            `Total: ${total.toFixed(2)} DH`,
            pageWidth - margin,
            doc.lastAutoTable.finalY + 10,
            { align: 'right' }
        );

        // Nom du fichier
        const nomFichier = selectedLogement === "tous" 
            ? `reservations_${moisNoms[mois]}_${annee}.pdf`
            : `reservations_${selectedLogement}_${moisNoms[mois]}_${annee}.pdf`;
        
        doc.save(nomFichier);

    } catch (error) {
        console.error("Erreur d'export PDF :", error);
        alert("Échec de l'export : " + error.message);
    }
}