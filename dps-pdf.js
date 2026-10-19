// dps-pdf.js — remplit la "Fiche de renseignements DPS" avec les données d'une demande.
// Les clés utilisées correspondent directement aux champs définis dans SCHEMA (common.js).

export const PDF_URL = "formulaire-dps.pdf";
const PDFLIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const H = 842;

/* ---------- Utilitaires de lecture des données ---------- */

const norm = s =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const isTs = v =>
  v && typeof v === "object" && typeof v.toDate === "function";

function flatten(o, out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && !isTs(v)) {
      flatten(v, out);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function reader(d) {
  const flat = flatten(d);
  const idx = {};
  const used = new Set();

  for (const k of Object.keys(flat)) {
    idx[norm(k)] = k;
  }

  const get = (...names) => {
    for (const n of names) {
      const k = idx[norm(n)];
      if (k === undefined) continue;

      used.add(k);
      const v = flat[k];

      if (v !== null && v !== undefined && v !== "") {
        return v;
      }
    }
    return "";
  };

  return {
    get,
    unused: () => Object.keys(flat).filter(k => !used.has(k)),
    keys: () => Object.keys(flat)
  };
}

const pad = n => String(n).padStart(2, "0");

function fmtDT(v) {
  if (!v) return "";

  if (isTs(v)) v = v.toDate();

  if (v instanceof Date) {
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()} ${pad(v.getHours())}h${pad(v.getMinutes())}`;
  }

  const m = String(v).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/
  );

  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}` +
      (m[4] ? ` ${m[4]}h${m[5]}` : "");
  }

  return String(v);
}

const yes = v =>
  v === true || /^(oui|yes|true|1|o)$/i.test(String(v ?? "").trim());

const no = v =>
  v === false || /^(non|no|false|0|n)$/i.test(String(v ?? "").trim());

const str = v =>
  Array.isArray(v)
    ? v.join(", ")
    : typeof v === "boolean"
      ? (v ? "Oui" : "Non")
      : isTs(v)
        ? fmtDT(v)
        : String(v ?? "").trim();

// Retourne l'index (0..3) d'un niveau 0,25 / 0,30 / 0,35 / 0,40.
function level(v, words) {
  if (v === "" || v == null) return -1;

  const n = parseFloat(String(v).replace(",", "."));

  if (!isNaN(n)) {
    const i = [0.25, 0.30, 0.35, 0.40].findIndex(
      x => Math.abs(x - n) < 0.001
    );
    if (i >= 0) return i;
  }

  const s = norm(v);

  for (let i = 0; i < words.length; i++) {
    if (words[i].some(w => s.includes(w))) return i;
  }

  return -1;
}

/* ---------- Remplissage du PDF ---------- */

export async function fillDps(PDFLib, pdfBytes, donnees) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pg = doc.getPages();

  const INK = rgb(0.05, 0.15, 0.5);
  const WHITE = rgb(1, 1, 1);

  const R = reader(donnees);
  const g = R.get;

  const clean = t =>
    [...str(t).replace(/\t/g, " ").replace(/²/g, "2").replace(/³/g, "3")]
      .map(c => {
        if (c === "\n") return c;
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");

  const W = (t, s) => font.widthOfTextAtSize(t, s);

  const wrap = (t, s, max) => {
    const out = [];

    for (const para of t.split("\n")) {
      let line = "";

      for (const w of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + " " + w : w;

        if (W(test, s) <= max) {
          line = test;
        } else {
          if (line) out.push(line);
          line = w;
        }
      }

      out.push(line);
    }

    return out;
  };

  const cover = (p, x0, top, x1, bot) =>
    p.drawRectangle({
      x: x0,
      y: H - bot,
      width: x1 - x0,
      height: bot - top,
      color: WHITE
    });

  const cross = (p, x, top, s = 7.9) => {
    const m = 1.2;
    const o = { thickness: 1.3, color: INK };

    p.drawLine({
      start: { x: x + m, y: H - (top + m) },
      end: { x: x + s - m, y: H - (top + s - m) },
      ...o
    });

    p.drawLine({
      start: { x: x + m, y: H - (top + s - m) },
      end: { x: x + s - m, y: H - (top + m) },
      ...o
    });
  };

  // Écrit une valeur dans une cellule du PDF.
  const put = (p, val, x, rowTop, rowBot, maxX, o = {}) => {
    const t = clean(val);
    if (!t) return;

    const avail = maxX - x;
    const size = o.size || 9;
    const min = 6.5;
    const mid = (rowTop + rowBot) / 2;

    const draw = (s, line, top) =>
      p.drawText(line, {
        x,
        y: H - top,
        size: s,
        font,
        color: INK
      });

    if (!o.top && !t.includes("\n")) {
      let s = size;

      while (s > min && W(t, s) > avail) {
        s -= 0.5;
      }

      if (W(t, s) <= avail) {
        return draw(s, t, mid + s * 0.35);
      }
    }

    let s = Math.min(size, 8.5);
    let lines;

    for (;;) {
      lines = wrap(t, s, avail);

      if (
        lines.length * s * 1.2 <= rowBot - rowTop - 2 ||
        s <= min
      ) {
        break;
      }

      s -= 0.5;
    }

    const lh = s * 1.2;
    const max = Math.max(
      1,
      Math.floor((rowBot - rowTop - 2) / lh)
    );

    if (lines.length > max) {
      lines = lines.slice(0, max);
      lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "…");
    }

    const start = o.top
      ? rowTop + 2
      : mid - (lines.length * lh) / 2 + 1;

    lines.forEach((l, i) => {
      draw(s, l, start + i * lh + s * 0.85);
    });
  };

  /* ===== Page 1 — Organisme demandeur ===== */

  let p = pg[0];

  const X1 = 172;
  const M1 = 548;

  put(p, g("raison"), X1, 395, 417, M1);
  put(p, g("service"), X1, 417, 438, M1);

  const orgType = g("typeOrg");

  if (orgType) {
    cover(p, 170.5, 443, 241.5, 456.8);
    put(p, orgType, 175.5, 443, 456.8, 243);
  }

  put(p, g("typeOrgAutre"), 322, 438, 462, M1);
  put(p, g("adresse"), X1, 462, 493, M1);
  put(p, g("tel"), X1, 493, 515, M1);
  put(p, g("suivi"), X1, 528, 549, M1);
  put(p, g("suiviFn"), X1, 549, 573, M1);
  put(p, g("suiviTel"), X1, 573, 594, M1);
  put(p, g("mail"), X1, 594, 616, M1);
  put(p, g("legal"), X1, 628, 650, M1);
  put(p, g("legalFn"), X1, 650, 672, M1);

  /* ===== Page 2 — Manifestation ===== */

  p = pg[1];

  const X2 = 172;
  const M2 = 540;

  put(p, g("nom"), X2, 101, 123, M2);

  const tm = g("typeMan");

  if (tm) {
    cover(p, 171, 127.6, 242, 141.5);
    put(p, tm, 175.5, 127.6, 141.5, 242);
  }

  put(p, g("typeManAutre"), 318, 123, 144, M2);
  put(p, fmtDT(g("debut")), X2, 144, 166, M2);
  put(p, fmtDT(g("fin")), X2, 166, 188, M2);
  put(p, g("adrMan"), X2, 188, 209, M2);
  put(p, g("contact"), X2, 209, 231, M2);
  put(p, g("contactFn"), X2, 231, 252, M2);
  put(p, g("contactTel"), X2, 252, 274, M2);

  const circuit = g("circuit");

  if (circuit) {
    cover(p, 44, 308, 106, 323);

    const c =
      circuit === "non"
        ? "Non"
        : circuit === "ouvert" || circuit === "ferme"
          ? "Oui"
          : str(circuit);

    put(p, c, 48, 308, 323, 160);

    if (circuit === "ouvert") cross(p, 193.1, 299.2);
    if (circuit === "ferme") cross(p, 193.1, 312.7);
  }

  put(p, g("superficie"), X2, 333, 354, M2);
  put(p, g("distMax"), X2, 354, 386, M2);
  put(p, g("risques"), X2, 386, 408, M2);

  const vp = g("vpsp");

  if (vp) {
    cover(p, 171, 417.6, 242, 431.5);

    const n = g("vpspNb");

    const isYes =
      yes(vp) ||
      (!no(vp) && /^\d+$/.test(String(vp)));

    put(
      p,
      isYes ? "Oui" : no(vp) ? "Non" : str(vp),
      175.5,
      417.6,
      431.5,
      242
    );

    put(
      p,
      n || (/^\d+$/.test(String(vp)) ? vp : ""),
      357,
      417.6,
      431.5,
      M2
    );
  }

  const chip = (val, top, bot, right) => {
    if (!val) return;

    cover(p, 169, top, right, bot);
    put(p, val, 176, top, bot, right - 2);
  };

  chip(g("poste"), 551.3, 568.3, 373.3);
  chip(g("elec"), 589.5, 606.5, 247.1);
  chip(g("eau"), 615.8, 632.8, 247.1);
  chip(g("repas"), 642, 659, 247.1);

  /* ===== Page 3 — Accessibilité et dispositif acteurs ===== */

  p = pg[2];

  const e1 = level(g("e1"), [
    ["aise", "permanente"],
    ["nonpermanente", "gradin", "chapiteau"],
    ["2hectares", "naturel35"],
    ["5hectares", "difficile"]
  ]);

  [117.4, 155.7, 207.4, 245.7].forEach((t, i) => {
    if (i === e1) cross(p, 68.6, t);
  });

  // E2 : délai d'intervention des secours publics (saisi par l'admin à la validation)
  const e2 = level(g("e2"), []);

  [346.4, 371.5, 396.6, 421.7].forEach((t, i) => {
    if (i === e2) cross(p, 68.6, t);
  });

  put(p, g("centres"), 328, 439, 455, 552);

  const act = g("acteurs");

  if (yes(act)) {
    cross(p, 104.6, 524.2);
  } else if (no(act)) {
    cross(p, 307.1, 521.7);
  }

  if (act && !no(act)) {
    put(p, g("actAge"), 176, 588, 618, 316);
    put(p, g("actNb"), 411, 588, 618, 548);

    const cat = norm(g("actCat"));

    if (/pro/.test(cat)) {
      cross(p, 208.8, 627.7);
    } else if (/amat/.test(cat)) {
      cross(p, 342.3, 627.7);
    } else if (/mixte/.test(cat)) {
      cross(p, 463.1, 627.7);
    }

    const ca = g("actContr");

    if (ca) {
      cover(p, 203, 653, 330, 670);
      put(p, ca, 206, 648, 674, 548);
    }
  }

  const orgContr = g("orgContr");
  const contraintes = Array.isArray(orgContr) ? orgContr : [];

  const num = (page, val, top, bot) => {
    if (val === "" || val == null) return;

    cover(page, 41, top - 1, 50, bot + 1);
    put(page, String(val), 42, top, bot, 60);
  };

  num(
    p,
    contraintes.includes("Équipe de poste de secours") ? 1 : "",
    717.1,
    726.1
  );

  num(
    p,
    contraintes.includes("Équipe d'intervention en VPS") ? 1 : "",
    736,
    745
  );

  num(
    p,
    contraintes.includes("Équipe nautique") ? 1 : "",
    754,
    763
  );

  /* ===== Page 4 — Dispositif public ===== */

  p = pg[3];

  num(
    p,
    contraintes.includes("Binôme dépendant d'une équipe") ? 1 : "",
    60,
    69
  );

  const pub = g("public");

  if (yes(pub)) {
    cross(p, 104.6, 131.5);
  } else if (no(pub)) {
    cross(p, 211.8, 129.0);
  }

  if (!no(pub)) {
    put(p, g("p1"), 257, 167, 192, 292);
    put(p, g("pCum"), 468, 167, 192, 548);
    put(p, g("pAge"), 168, 192, 218, 292);

    const pers = g("perso");

    if (pers) {
      cover(p, 424.2, 197.6, 502.3, 214.6);

      put(
        p,
        yes(pers) ? "Oui" : no(pers) ? "Non" : pers,
        431,
        197.6,
        214.6,
        548
      );
    }

    const bp = g("besoins");

    if (bp) {
      cover(p, 213.7, 223.9, 291.7, 240.9);

      put(
        p,
        yes(bp) ? "Oui" : no(bp) ? "Non" : "Oui",
        220,
        223.9,
        240.9,
        290
      );
    }

    put(
      p,
      g("besoinsP"),
      364,
      218,
      245,
      548
    );

    const p2 = level(g("p2"), [
      ["assis"],
      ["deboutceremonie", "restauration", "exposition", "foire", "salon"],
      ["statique", "protection"],
      ["dynamique", "danse", "feria", "carnaval", "festival"]
    ]);

    [298.5, 323.6, 348.7, 386.9].forEach((t, i) => {
      if (i === p2) cross(p, 68.6, t);
    });

    put(p, g("comm"), 42, 453, 790, 552, { top: true });
  }

  /* ===== Page 5 — Proposition de dimensionnement (saisie par l'admin) ===== */

  p = pg[4];

  // Remplace le "…" (x 42.5 à 47.7) devant chaque ligne par un nombre.
  const dn = (val, top, bot) => {
    const t = clean(val);
    if (!t) return;

    cover(p, 41, top - 1, 49.6, bot + 1);

    let s = 8.5;
    while (s > 5 && W(t, s) > 8.6) s -= 0.5;

    p.drawText(t, {
      x: 41,
      y: H - (top + 6.6),
      size: s,
      font,
      color: INK
    });
  };

  dn(g("dimTotal"), 616.8, 625.8);
  dn(g("dimPoste"), 635.3, 644.3);
  dn(g("dimInterv"), 653.8, 662.8);
  dn(g("dimBinome"), 672.3, 681.3);
  dn(g("dimEncad"), 690.8, 699.8);
  dn(g("dimVehic"), 709.3, 718.3);

  put(p, g("dimIntervType"), 276, 653.3, 663.3, 552);
  put(p, g("dimBinomeType"), 320, 671.8, 681.8, 552);
  put(p, g("dimJust"), 104, 744.3, 812, 552, { top: true });

  const unused = R.unused();

  if (unused.length) {
    console.warn(
      "[dps-pdf] Champs de la demande non utilisés pour le PDF :",
      unused
    );
  }

  return await doc.save();
}

/* ---------- Ouverture du PDF dans un nouvel onglet ---------- */

// À appeler depuis un clic : ouvrir l'onglet avant les await.
export async function openDpsPdf(
  donnees,
  win,
  nom = "demande-dps"
) {
  try {
    win?.document?.write(
      "<p style='font:16px sans-serif;padding:20px'>Génération du PDF…</p>"
    );

    const [PDFLib, res] = await Promise.all([
      import(PDFLIB_URL),
      fetch(PDF_URL)
    ]);

    if (!res.ok) {
      throw new Error("Modèle PDF introuvable (" + PDF_URL + ")");
    }

    const bytes = await fillDps(
      PDFLib,
      await res.arrayBuffer(),
      donnees
    );

    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" })
    );

    if (win && !win.closed) {
      win.location.href = url;
    } else {
      const a = document.createElement("a");

      a.href = url;
      a.target = "_blank";
      a.download = nom + ".pdf";

      document.body.append(a);
      a.click();
      a.remove();
    }

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10 * 60 * 1000);

  } catch (e) {
    win?.close?.();
    console.error("[dps-pdf] Erreur de génération :", e);
    throw e;
  }
}