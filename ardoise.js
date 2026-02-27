(function () {
    'use strict';

    // ===== CONFIGURATION =====
    var SHEET_ID = localStorage.getItem('ardoise_sheet_id') || 'VOTRE_SHEET_ID_ICI';
    var CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv';
    var DELAY_MS = 1500;
    var STORAGE_KEY = 'ardoise_shown';
    var CATEGORY_ORDER = ['Formule', 'Entree', 'Entrée', 'Plat', 'Dessert', 'Suggestion'];


    // ===== CSV PARSER =====
    function parseCSV(text) {
        var rows = [];
        var current = '';
        var inQuotes = false;
        var row = [];

        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(current.trim());
                current = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
                row.push(current.trim());
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
                current = '';
            } else {
                current += ch;
            }
        }
        row.push(current.trim());
        if (row.length > 1 || row[0] !== '') rows.push(row);
        return rows;
    }

    // ===== DATE HELPERS =====
    function todayStr() {
        var d = new Date();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
    }

    function normalizeDate(raw) {
        if (!raw) return '';
        raw = raw.trim();
        // DD/MM/YYYY
        var slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
            return slashMatch[3] + '-' + slashMatch[2].padStart(2, '0') + '-' + slashMatch[1].padStart(2, '0');
        }
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        return raw;
    }

    function formatDateFR() {
        var d = new Date();
        var jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return jours[d.getDay()] + ' ' + d.getDate() + ' ' + mois[d.getMonth()] + ' ' + d.getFullYear();
    }

    // ===== CATEGORY SORT =====
    function categoryRank(name) {
        var normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (var i = 0; i < CATEGORY_ORDER.length; i++) {
            var orderNorm = CATEGORY_ORDER[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalized.toLowerCase() === orderNorm.toLowerCase()) return i;
        }
        return CATEGORY_ORDER.length;
    }

    // ===== MODAL CONTROLS =====
    function openArdoise() {
        var overlay = document.getElementById('ardoise-overlay');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        sessionStorage.setItem(STORAGE_KEY, '1');
    }

    function closeArdoise() {
        var overlay = document.getElementById('ardoise-overlay');
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function bindClose() {
        var overlay = document.getElementById('ardoise-overlay');
        overlay.querySelector('.ardoise-close').addEventListener('click', closeArdoise);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeArdoise();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeArdoise();
        });
    }

    // ===== RENDER =====
    function render(items) {
        // Group by category
        var groups = {};
        items.forEach(function (item) {
            var cat = item.categorie || 'Suggestion';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });

        // Sort categories
        var sortedCats = Object.keys(groups).sort(function (a, b) {
            return categoryRank(a) - categoryRank(b);
        });

        var html = '';
        sortedCats.forEach(function (cat) {
            html += '<div class="ardoise-category">';
            html += '<h3 class="ardoise-category-title">' + escapeHTML(cat) + '</h3>';
            groups[cat].forEach(function (item) {
                html += '<div class="ardoise-item">';
                html += '<div class="ardoise-item-info">';
                html += '<div class="ardoise-item-name">' + escapeHTML(item.nom) + '</div>';
                if (item.description) {
                    html += '<div class="ardoise-item-desc">' + escapeHTML(item.description) + '</div>';
                }
                html += '</div>';
                if (item.prix) {
                    html += '<span class="ardoise-item-price">' + escapeHTML(item.prix) + '&euro;</span>';
                }
                html += '</div>';
            });
            html += '</div>';
        });

        document.querySelector('.ardoise-content').innerHTML = html;
        document.querySelector('.ardoise-date').textContent = formatDateFR();
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== MAIN =====
    function init() {
        fetch(CSV_URL)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (text) {
                var rows = parseCSV(text);
                if (rows.length < 2) return;

                // Header mapping (case-insensitive, accent-insensitive)
                var headers = rows[0].map(function (h) {
                    return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                });
                var colDate = headers.indexOf('date');
                var colCat = headers.indexOf('categorie');
                var colNom = headers.indexOf('nom');
                var colDesc = headers.indexOf('description');
                var colPrix = headers.indexOf('prix');
                var colActif = headers.indexOf('actif');

                var today = todayStr();
                var items = [];

                for (var r = 1; r < rows.length; r++) {
                    var row = rows[r];
                    // Skip inactive
                    var actif = colActif >= 0 ? (row[colActif] || '').toUpperCase().trim() : 'OUI';
                    if (actif !== 'OUI') continue;
                    // Filter by date
                    var dateVal = colDate >= 0 ? normalizeDate(row[colDate]) : '';
                    if (dateVal !== today) continue;

                    items.push({
                        categorie: colCat >= 0 ? (row[colCat] || '').trim() : '',
                        nom: colNom >= 0 ? (row[colNom] || '').trim() : '',
                        description: colDesc >= 0 ? (row[colDesc] || '').trim() : '',
                        prix: colPrix >= 0 ? (row[colPrix] || '').trim() : ''
                    });
                }

                if (items.length === 0) return;

                render(items);
                bindClose();
                setTimeout(openArdoise, DELAY_MS);
            })
            .catch(function (err) {
                console.warn('[Ardoise] Impossible de charger les suggestions du jour :', err.message);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
