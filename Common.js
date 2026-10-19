import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getFirestore}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const firebaseConfig={apiKey:"AIzaSyBzfHOG5o8rX5iW-5lVu21bzyKfK2L0p1Y",authDomain:"demande-dps.firebaseapp.com",projectId:"demande-dps",storageBucket:"demande-dps.firebasestorage.app",messagingSenderId:"374355628468",appId:"1:374355628468:web:1e578e51e661cd6e6622e1",measurementId:"G-P76VE5XWNF"};
export const app=initializeApp(firebaseConfig);
export const db=getFirestore(app);
export const COL="demandes";
export const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const norm=o=>Array.isArray(o)?o:[o,o];
export const fdate=t=>{const x=t?.toDate?t.toDate():new Date(t);return isNaN(x)?"":x.toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})};
export const header=(r="")=>`<header><div class="logo"><svg viewBox="0 0 10 10"><path fill="#e30613" d="M3.5 0h3v3.5H10v3H6.5V10h-3V6.5H0v-3h3.5z"/></svg><span>CROIX-ROUGE<br>FRANÇAISE</span></div><span class="sp"></span>${r}</header>`;

const YN=[["oui","Oui"],["non","Non"]];
const TYPES=["Sportive","Culturelle","Concert / festival","Spectacle","Foire / salon / exposition","Cérémonie / réunion publique","Autre"];
const ORG=["Association","Collectivité / mairie","Établissement scolaire","Entreprise","Club sportif","Autre"];
export const SCHEMA=[
{id:"org",t:"Organisme demandeur",f:[
{k:"raison",l:"Raison sociale"},{k:"service",l:"Service",opt:1},
{k:"typeOrg",l:"Type d'organisateur",t:"select",o:ORG},{k:"typeOrgAutre",l:"Précisez le type",show:d=>d.typeOrg==="Autre"},
{k:"adresse",l:"Adresse",full:1},{k:"tel",l:"Téléphone",t:"tel"},
{k:"suivi",l:"Dossier suivi par"},{k:"suiviFn",l:"Fonction"},{k:"suiviTel",l:"Téléphone du suivi",t:"tel"},{k:"mail",l:"Mail",t:"email"},
{k:"legal",l:"Représentant légal"},{k:"legalFn",l:"Fonction du représentant"}]},
{id:"man",t:"La manifestation",f:[
{k:"nom",l:"Nom de la manifestation",full:1},{k:"typeMan",l:"Type de manifestation",t:"select",o:TYPES},{k:"typeManAutre",l:"Précisez le type",show:d=>d.typeMan==="Autre"},
{k:"debut",l:"Début",t:"datetime-local"},{k:"fin",l:"Fin",t:"datetime-local"},
{k:"adrMan",l:"Adresse du site",full:1,h:"Manifestation sur plusieurs sites : une demande par site."},
{k:"contact",l:"Contact sur place"},{k:"contactFn",l:"Fonction du contact"},{k:"contactTel",l:"Téléphone du contact",t:"tel"},
{k:"circuit",l:"Circuit",t:"radio",full:1,o:[["non","Pas de circuit"],["ouvert","Circuit ouvert","Sur voie publique non fermée à la circulation"],["ferme","Circuit fermé","Sur voie privée ou voie publique fermée à la circulation"]]},
{k:"superficie",l:"Superficie du site",h:"Ex : 1,5 ha ou 800 m²"},{k:"distMax",l:"Distance maximale sur site",h:"Ex : 400 m"},
{k:"risques",l:"Risques particuliers",t:"textarea",full:1,h:"Écrivez « Aucun » si non concerné."},
{k:"vpsp",l:"Demande de vecteur d'évacuation (VPSP)",t:"radio",row:1,o:YN,h:"Évacuation en véhicule de premiers secours avec 3 intervenants. Ces équipes ne comptent pas dans le calcul du ratio."},
{k:"vpspNb",l:"Nombre de VPSP",t:"number",show:d=>d.vpsp==="oui"}]},
{id:"log",t:"Aspects logistiques",f:[
{k:"poste",l:"Poste de secours mis à disposition par l'organisateur",t:"select",full:1,o:["Local en dur","Tente ou chapiteau","Rien : à fournir par la Croix-Rouge"]},
{k:"elec",l:"Accès à l'électricité",t:"radio",row:1,o:YN},{k:"eau",l:"Accès à l'eau courante",t:"radio",row:1,o:YN},
{k:"repas",l:"Repas des secouristes fournis",t:"radio",row:1,o:YN,full:1,h:"Repas et boissons à votre charge si le dispositif couvre 12h-14h et/ou 19h-21h. Sinon, une indemnité forfaitaire par personne est prévue dans la convention."}]},
{id:"acc",t:"Accessibilité du site",f:[
{k:"e1",l:"Caractéristiques de l'environnement et de l'accessibilité",t:"radio",full:1,o:[
["0,25","Accès aisé","Structure permanente (bâtiment, salle en dur…) ; voie publique avec accès dégagés"],
["0,30","Structure non permanente","Gradins, tribunes, chapiteaux… ; espace naturel de moins de 2 ha ; brancardage de 150 à 300 m ; pente sur plus de 100 m"],
["0,35","Espace naturel moyen","Surface de 2 à 5 ha ; brancardage de 150 à 300 m ; pente sur plus de 100 m ; autres conditions d'accès difficile"],
["0,40","Espace naturel difficile","Plus de 5 ha ; brancardage au-delà de 600 m ; pente sur plus de 300 m ; progression des secours rendue difficile par le public"]]}]},
{id:"act",t:"Dispositif acteurs",f:[
{k:"acteurs",l:"Le dispositif de secours doit-il couvrir les acteurs ?",t:"radio",row:1,full:1,o:YN,h:"Acteurs : participants à l'événement (sportif, culturel…), hors public. Les couvrir impose un poste de secours d'au moins 4 intervenants."}]},
{id:"actd",t:"Détail des acteurs",show:d=>d.acteurs==="oui",f:[
{k:"actAge",l:"Tranche d'âge des acteurs"},{k:"actNb",l:"Nombre d'acteurs",t:"number"},
{k:"actCat",l:"Catégorie d'acteurs",t:"radio",row:1,full:1,o:["Professionnels","Amateurs","Mixte"]},
{k:"actContr",l:"Contraintes imposées aux acteurs",opt:1,full:1,h:"Port du casque, etc."},
{k:"orgContr",l:"Contraintes imposées à l'organisateur (fédération, préfecture…)",t:"check",opt:1,full:1,o:["Équipe de poste de secours","Équipe d'intervention en VPS","Équipe nautique","Binôme dépendant d'une équipe"]}]},
{id:"pub",t:"Dispositif public",f:[
{k:"public",l:"Le dispositif doit-il couvrir le public ?",t:"radio",row:1,full:1,o:YN,h:"Public : ensemble des personnes qui assistent effectivement à un spectacle, une manifestation, un rendez-vous sportif…"}]},
{id:"pubd",t:"Détail du public",show:d=>d.public==="oui",f:[
{k:"p1",l:"Effectif maximum instantané",t:"number"},{k:"pCum",l:"Effectif maximum cumulé",t:"number"},
{k:"pAge",l:"Tranche d'âge du public"},{k:"perso",l:"Présence de personnalités",t:"radio",row:1,o:YN},
{k:"besoins",l:"Public avec des besoins particuliers",t:"radio",row:1,o:YN},{k:"besoinsP",l:"Précisez les besoins",show:d=>d.besoins==="oui"},
{k:"p2",l:"Type de public et comportement",t:"radio",full:1,o:[
["0,25","Public assis","Spectacle, cérémonie culturelle, réunion publique"],
["0,30","Public debout","Cérémonie culturelle, réunion publique, restauration, exposition, foire, salon…"],
["0,35","Public debout, plus statique","Spectacle avec public statique, événement sportif avec protection du public par rapport à l'événement…"],
["0,40","Public debout, dynamique","Danse, féria, carnaval, spectacle de rue, festival, événement sur plusieurs jours avec public permanent"]]},
{k:"comm",l:"Commentaire",t:"textarea",opt:1,full:1}]},
{id:"sign",t:"Validation",f:[
{k:"signNom",l:"Nom du signataire"},{k:"signFn",l:"Fonction du signataire"},
{k:"ack",l:"J'atteste que les informations fournies sont exactes et je m'engage à signaler tout changement avant la manifestation.",t:"ack",full:1}]}];

export const steps=d=>SCHEMA.filter(s=>!s.show||s.show(d));
export const vis=(s,d)=>s.f.filter(f=>!f.show||f.show(d));
export function fmt(d){
const v=(f,x)=>{if(Array.isArray(x))return x.join(", ")||"—";if(x===true)return"Oui";if(f.t==="datetime-local")return fdate(x);
if(f.o){const o=f.o.map(norm).find(o=>o[0]===x);if(o)return f.k==="e1"||f.k==="p2"?`${o[1]} (${o[0]})`:o[1]}
return x===undefined||x===""?"—":x};
return steps(d).filter(s=>s.id!=="sign").map(s=>({t:s.t,rows:vis(s,d).map(f=>[f.l,v(f,d[f.k])])}))}
export const recap=d=>`<div class="rec">${fmt(d).map(s=>`<h3>${esc(s.t)}</h3><dl>${s.rows.map(r=>`<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>`).join("")}${d.signNom?`<h3>Signature</h3><dl><dt>Signataire</dt><dd>${esc(d.signNom)}, ${esc(d.signFn)}</dd></dl>`:""}</div>`;