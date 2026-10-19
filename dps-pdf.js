// dps-pdf.js — remplit la "Fiche de renseignements DPS" avec les données d'une demande.
// Le PDF n'ayant pas de champs de formulaire, le texte est écrit par-dessus (coordonnées en points PDF).
//
// ⚠️ MAPPING : les noms de champs de Firestore (donnees.xxx) sont listés dans la fonction `fillDps`,
//    chacun avec plusieurs variantes possibles (casse, accents et séparateurs sont ignorés).
//    Si un champ reste vide dans le PDF, ajoutez simplement le vrai nom dans la liste correspondante.

export const PDF_URL = "formulaire-dps.pdf";
const PDFLIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const H = 842;

/* ---------- utilitaires de lecture des données ---------- */
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const isTs = v => v && typeof v === "object" && typeof v.toDate === "function";

function flatten(o, out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && !isTs(v)) flatten(v, out);
    else out[k] = v;
  }
  return out;
}

function reader(d) {
  const flat = flatten(d), idx = {}, used = new Set();
  for (const k of Object.keys(flat)) idx[norm(k)] = k;
  const get = (...names) => {
    for (const n of names) {
      const k = idx[norm(n)];
      if (k === undefined) continue;
      used.add(k);
      const v = flat[k];
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return "";
  };
  return { get, unused: () => Object.keys(flat).filter(k => !used.has(k)), keys: () => Object.keys(flat) };
}

const pad = n => String(n).padStart(2, "0");
function fmtDT(v) {
  if (!v) return "";
  if (isTs(v)) v = v.toDate();
  if (v instanceof Date) return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()} ${pad(v.getHours())}h${pad(v.getMinutes())}`;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}h${m[5]}` : "");
  return String(v);
}
const yes = v => v === true || /^(oui|yes|true|1|o)$/i.test(String(v ?? "").trim());
const no = v => v === false || /^(non|no|false|0|n)$/i.test(String(v ?? "").trim());
const str = v => Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Oui" : "Non") : isTs(v) ? fmtDT(v) : String(v ?? "").trim();

// Retourne l'index (0..3) d'un niveau 0,25 / 0,30 / 0,35 / 0,40 (nombre, texte ou index)
function level(v, words) {
  if (v === "" || v == null) return -1;
  const n = parseFloat(String(v).replace(",", "."));
  if (!isNaN(n)) {
    const i = [0.25, 0.30, 0.35, 0.40].findIndex(x => Math.abs(x - n) < 0.001);
    if (i >= 0) return i;
  }
  const s = norm(v);
  for (let i = 0; i < words.length; i++) if (words[i].some(w => s.includes(w))) return i;
  return -1;
}

/* ---------- remplissage ---------- */
export async function fillDps(PDFLib, pdfBytes, donnees) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pg = doc.getPages();
  const INK = rgb(0.05, 0.15, 0.5), WHITE = rgb(1, 1, 1);
  const R = reader(donnees), g = R.get;

  const clean = t => [...str(t).replace(/\t/g, " ").replace(/²/g, "2").replace(/³/g, "3")].map(c => { if (c === "\n") return c; try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const W = (t, s) => font.widthOfTextAtSize(t, s);
  const wrap = (t, s, max) => {
    const out = [];
    for (const para of t.split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + " " + w : w;
        if (W(test, s) <= max) line = test;
        else { if (line) out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  };
  const cover = (p, x0, top, x1, bot) => p.drawRectangle({ x: x0, y: H - bot, width: x1 - x0, height: bot - top, color: WHITE });
  const cross = (p, x, top, s = 7.9) => {
    const m = 1.2, o = { thickness: 1.3, color: INK };
    p.drawLine({ start: { x: x + m, y: H - (top + m) }, end: { x: x + s - m, y: H - (top + s - m) }, ...o });
    p.drawLine({ start: { x: x + m, y: H - (top + s - m) }, end: { x: x + s - m, y: H - (top + m) }, ...o });
  };
  // Écrit `val` dans la cellule [rowTop,rowBot], de x à maxX ; réduit la police, sinon passe à la ligne.
  const put = (p, val, x, rowTop, rowBot, maxX, o = {}) => {
    const t = clean(val); if (!t) return;
    const avail = maxX - x, size = o.size || 9, min = 6.5, mid = (rowTop + rowBot) / 2;
    const draw = (s, line, top) => p.drawText(line, { x, y: H - top, size: s, font, color: INK });
    if (!o.top && !t.includes("\n")) {
      let s = size; while (s > min && W(t, s) > avail) s -= 0.5;
      if (W(t, s) <= avail) return draw(s, t, mid + s * 0.35);
    }
    let s = Math.min(size, 8.5), lines;
    for (; ; s -= 0.5) {
      lines = wrap(t, s, avail);
      if (lines.length * s * 1.2 <= rowBot - rowTop - 2 || s <= min) break;
    }
    const lh = s * 1.2, max = Math.max(1, Math.floor((rowBot - rowTop - 2) / lh));
    if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "…"); }
    const start = o.top ? rowTop + 2 : mid - (lines.length * lh) / 2 + 1;
    lines.forEach((l, i) => draw(s, l, start + i * lh + s * 0.85));
  };

  /* ===== Page 1 — Organisme demandeur ===== */
  let p = pg[0];
  const X1 = 172, M1 = 548;
  put(p, g("raisonSociale", "raison", "organisme", "organisateur"), X1, 395, 417, M1);
  put(p, g("service", "serviceOrganisme"), X1, 417, 438, M1);
  const orgType = g("typeOrganisateur", "typeOrganisme", "typeOrg", "organisateurType");
  if (orgType) { cover(p, 170.5, 443, 241.5, 456.8); put(p, orgType, 175.5, 443, 456.8, 243); }
  put(p, g("typeOrganisateurAutre", "autreTypeOrganisateur", "typeOrgAutre", "autreType", "precisionType"), 322, 438, 462, M1);
  put(p, g("adresseOrganisme", "adresseOrg", "adresseOrganisateur", "adresse"), X1, 462, 493, M1);
  put(p, g("telephoneOrganisme", "telephoneOrg", "telOrganisme", "telephone", "tel"), X1, 493, 515, M1);
  put(p, g("suiviPar", "suiviDossierPar", "suiviDuDossierPar", "contactNom", "responsable"), X1, 528, 549, M1);
  put(p, g("fonctionSuivi", "fonctionContact", "fonctionResponsable", "fonction"), X1, 549, 573, M1);
  put(p, g("telephoneSuivi", "telSuivi", "telephoneContact", "telContact", "mobile"), X1, 573, 594, M1);
  put(p, g("mail", "email", "courriel", "emailContact"), X1, 594, 616, M1);
  put(p, g("representantLegal", "representant"), X1, 628, 650, M1);
  put(p, g("fonctionRepresentant", "fonctionRepresentantLegal", "fonctionRepresentantlegal"), X1, 650, 672, M1);

  /* ===== Page 2 — Manifestation ===== */
  p = pg[1];
  const X2 = 172, M2 = 540;
  put(p, g("nomManifestation", "manifestation", "nomManif", "nom", "intitule"), X2, 101, 123, M2);
  const tm = g("typeManifestation", "typeManif");
  if (tm) { cover(p, 171, 127.6, 242, 141.5); put(p, tm, 175.5, 127.6, 141.5, 242); }
  put(p, g("typeManifestationAutre", "autreTypeManifestation", "typeManifAutre", "precisionTypeManifestation"), 318, 123, 144, M2);
  put(p, fmtDT(g("debut", "dateDebut", "dateHeureDebut", "dateEtHeureDeDebut")), X2, 144, 166, M2);
  put(p, fmtDT(g("fin", "dateFin", "dateHeureFin", "dateEtHeureDeFin")), X2, 166, 188, M2);
  put(p, g("adresseManifestation", "adresseSite", "lieu", "adresseManif", "adresseEvenement"), X2, 188, 209, M2);
  put(p, g("contactSurPlace", "nomContactSurPlace", "contactPlace", "contactSite", "nomContact"), X2, 209, 231, M2);
  put(p, g("fonctionContactSurPlace", "fonctionContactPlace", "fonctionContactSite"), X2, 231, 252, M2);
  put(p, g("telephoneContactSurPlace", "telContactSurPlace", "telephoneContactPlace", "telContactPlace", "telephoneSite"), X2, 252, 274, M2);

  const circuit = g("circuit");
  if (circuit) {
    cover(p, 44, 308, 106, 323);
    const c = yes(circuit) ? "Oui" : no(circuit) ? "Non" : str(circuit);
    put(p, c, 48, 308, 323, 160);
    const ct = norm(g("circuitType", "typeCircuit", "circuitOuvertFerme", "circuitNature"));
    if (yes(circuit) || /ouvert|ferme/.test(norm(circuit))) {
      if (/ouvert/.test(ct + norm(circuit))) cross(p, 193.1, 299.2);
      if (/ferme/.test(ct + norm(circuit))) cross(p, 193.1, 312.7);
    }
  }
  put(p, g("superficie", "superficieSite", "surface"), X2, 333, 354, M2);
  put(p, g("distanceMaximale", "distanceMax", "distanceMaximaleSurSite", "distance"), X2, 354, 386, M2);
  put(p, g("risquesParticuliers", "risques"), X2, 386, 408, M2);
  const vp = g("vecteurEvacuation", "vpsp", "demandeVpsp", "demandeVecteurEvacuation", "evacuation");
  if (vp) {
    cover(p, 171, 417.6, 242, 431.5);
    const n = g("nombreVpsp", "nbVpsp", "vpspNombre", "nombreVecteurs", "nombreVecteursEvacuation");
    const isYes = yes(vp) || (!no(vp) && /^\d+$/.test(String(vp)));
    put(p, isYes ? "Oui" : no(vp) ? "Non" : str(vp), 175.5, 417.6, 431.5, 242);
    put(p, n || (/^\d+$/.test(String(vp)) ? vp : ""), 357, 417.6, 431.5, M2);
  }
  const chip = (val, top, bot, right) => { if (!val) return; cover(p, 169, top, right, bot); put(p, val, 176, top, bot, right - 2); };
  chip(g("posteSecours", "miseADispositionPoste", "typePosteSecours", "miseADisposition", "poste"), 551.3, 568.3, 373.3);
  chip(g("electricite", "accesElectricite"), 589.5, 606.5, 247.1);
  chip(g("eau", "eauCourante", "accesEauCourante"), 615.8, 632.8, 247.1);
  chip(g("repas", "repasSecouristes", "repasFournis"), 642, 659, 247.1);

  /* ===== Page 3 — Accessibilité + dispositif acteur ===== */
  p = pg[2];
  const e1 = level(g("e1", "accessibilite", "accessibiliteSite", "environnement"),
    [["aise", "permanente"], ["nonpermanente", "gradin", "chapiteau"], ["2hectares", "naturel35"], ["5hectares", "difficile"]]);
  [117.4, 155.7, 207.4, 245.7].forEach((t, i) => { if (i === e1) cross(p, 68.6, t); });

  const act = g("dispositifActeur", "acteurs", "dispositifActeurs", "acteur");
  const actYes = yes(act) || (act && !no(act));
  if (yes(act)) cross(p, 104.6, 524.2); else if (no(act)) cross(p, 307.1, 521.7);
  if (act && !no(act)) {
    put(p, g("trancheAgeActeurs", "ageActeurs", "trancheAgeDesActeurs"), 176, 588, 618, 316);
    put(p, g("nombreActeurs", "nbActeurs", "effectifActeurs"), 411, 588, 618, 548);
    const cat = norm(g("categorieActeurs", "categorieActeur", "typeActeurs"));
    if (/pro/.test(cat)) cross(p, 208.8, 627.7);
    else if (/amat/.test(cat)) cross(p, 342.3, 627.7);
    else if (/mixte/.test(cat)) cross(p, 463.1, 627.7);
    const ca = g("contraintesActeurs", "contraintesImposeesActeurs", "contrainteActeurs");
    if (ca) { cover(p, 203, 653, 330, 670); put(p, ca, 206, 648, 674, 548); }
  }
  const num = (page, val, top, bot) => { if (val === "" || val == null) return; cover(page, 41, top - 1, 50, bot + 1); put(page, String(val), 42, top, bot, 60); };
  num(p, g("equipePosteSecours", "contraintePosteSecours", "contraintePoste", "equipePoste"), 717.1, 726.1);
  num(p, g("equipeInterventionVps", "contrainteInterventionVps", "contrainteVps", "equipeVps"), 736, 745);
  num(p, g("equipeNautique", "contrainteNautique", "nautique"), 754, 763);

  /* ===== Page 4 — Dispositif public ===== */
  p = pg[3];
  num(p, g("binome", "contrainteBinome", "equipeBinome", "binomeEquipe"), 60, 69);
  const pub = g("dispositifPublic", "public", "dispositifPublique");
  if (yes(pub)) cross(p, 104.6, 131.5); else if (no(pub)) cross(p, 211.8, 129.0);
  if (!no(pub)) {
    put(p, g("effectifMaxInstantane", "effectifInstantane", "p1", "publicInstantane", "effectifMaximumInstantane"), 257, 167, 192, 292);
    put(p, g("effectifMaxCumule", "effectifCumule", "publicCumule", "effectifMaximumCumule"), 468, 167, 192, 548);
    put(p, g("trancheAgePublic", "agePublic", "trancheAgeDuPublic"), 168, 192, 218, 292);
    const pers = g("personnalites", "presencePersonnalites");
    if (pers) { cover(p, 424.2, 197.6, 502.3, 214.6); put(p, yes(pers) ? "Oui" : no(pers) ? "Non" : pers, 431, 197.6, 214.6, 548); }
    const bp = g("besoinsParticuliers", "publicBesoinsParticuliers", "publicAvecBesoinsParticuliers");
    if (bp) { cover(p, 213.7, 223.9, 291.7, 240.9); put(p, yes(bp) ? "Oui" : no(bp) ? "Non" : "Oui", 220, 223.9, 240.9, 290); }
    put(p, g("besoinsParticuliersPrecision", "precisionBesoinsParticuliers", "besoinsPrecision", "besoinsParticuliersDetail") || (bp && !yes(bp) && !no(bp) ? bp : ""), 364, 218, 245, 548);
    const p2 = level(g("p2", "typePublic", "comportementPublic", "typeDePublicEtComportement"),
      [["assis"], ["deboutceremonie", "restauration", "exposition", "foire", "salon"], ["statique", "protection"], ["dynamique", "danse", "feria", "carnaval", "festival"]]);
    [298.5, 323.6, 348.7, 386.9].forEach((t, i) => { if (i === p2) cross(p, 68.6, t); });
    put(p, g("commentaire", "commentaires", "remarques", "informationsComplementaires"), 42, 453, 790, 552, { top: true });
  }

  const unused = R.unused();
  if (unused.length) console.warn("[dps-pdf] Champs de la demande non utilisés pour le PDF :", unused);
  return await doc.save();
}

/* ---------- ouverture dans un nouvel onglet ---------- */
// À appeler depuis un clic : ouvrez l'onglet AVANT les `await` (anti pop-up), puis passez-le ici.
export async function openDpsPdf(donnees, win, nom = "demande-dps") {
  try {
    win?.document?.write("<p style='font:16px sans-serif;padding:20px'>Génération du PDF…</p>");
    const [PDFLib, res] = await Promise.all([import(PDFLIB_URL), fetch(PDF_URL)]);
    if (!res.ok) throw new Error("Modèle PDF introuvable (" + PDF_URL + ")");
    const bytes = await fillDps(PDFLib, await res.arrayBuffer(), donnees);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (win && !win.closed) win.location.href = url;
    else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.download = nom + ".pdf"; document.body.append(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  } catch (e) { win?.close?.(); throw e; }
}