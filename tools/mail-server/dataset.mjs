import { buildMessage } from './mime.mjs';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const alice = { name: 'Alice Durand', email: 'alice@example.com' };
const bob = { name: 'Bob Martin', email: 'bob@example.com' };

const people = {
  claire: { name: 'Claire Dubois', email: 'claire.dubois@lumen.example' },
  thomas: { name: 'Thomas Girard', email: 'thomas.girard@lumen.example' },
  sophie: { name: 'Sophie Bernard', email: 'sophie@atelier-bernard.example' },
  hugo: { name: 'Hugo Lefèvre', email: 'hugo.lefevre@studio-nord.example' },
  ines: { name: 'Inès Moreau', email: 'ines.moreau@cabinet-moreau.example' },
  daniel: { name: 'Daniel Weber', email: 'd.weber@kraftwerk.example' },
  laura: { name: 'Laura García', email: 'laura.garcia@sol.example' },
  marco: { name: 'Marco Rossi', email: 'marco.rossi@ponte.example' },
  nadia: { name: 'Nadia Benali', email: 'nadia.benali@mail.example' },
  julien: { name: 'Julien Roux', email: 'julien.roux@mail.example' },
};

const services = {
  hosting: { name: 'Hébergeur Cloud', email: 'noreply@hebergeur.example' },
  billing: { name: 'Hébergeur Cloud — Facturation', email: 'facturation@hebergeur.example' },
  parcel: { name: 'Colis Express', email: 'suivi@colis.example' },
  newsletter: { name: 'Le Fil Tech', email: 'newsletter@lefil.example' },
  calendar: { name: 'Agenda', email: 'agenda@lumen.example' },
  bank: { name: 'Banque Exemple', email: 'alertes@banque.example' },
  spam: { name: 'Service Clients', email: 'gagnant@promo-offres.example' },
  shop: { name: 'Boutique Lumière', email: 'offres@news.boutique.example' },
  orders: { name: 'Boutique Lumière', email: 'commandes@boutique.example' },
  forum: { name: 'Forum Rust FR', email: 'notifications@forum.example' },
  login: { name: 'Compte Lumen', email: 'noreply@compte.example' },
};

// What lists and marketing platforms add, which the app sorts the inbox by.
function listHeaders(domain) {
  return [`List-Unsubscribe: <https://${domain}/desinscription>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'];
}

const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR4nGNgGAWjYBSMglEwCkbBKBgFgwEAA/AAAZ8C5KcAAAAASUVORK5CYII=',
  'base64',
);

function pdf(title) {
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Title (${title}) >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function signature(person) {
  return `\n\n${person.name}`;
}

function newsletterHtml(issue) {
  return `<!doctype html><html><body style="margin:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e4e7ec"><img src="cid:logo@lefil.example" width="16" height="16" alt="">
<span style="font-size:13px;color:#667085;margin-left:8px">Le Fil Tech · n°${issue}</span></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 12px;font-size:24px;color:#101828">Ce qu'il fallait retenir cette semaine</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#344054">Trois sujets ont dominé l'actualité : la sortie d'une nouvelle version de Rust,
les débats sur la sobriété numérique et l'essor des clients mail open source.</p>
<img src="https://images.lefil.example/couverture-${issue}.jpg" width="576" height="240" alt="Illustration" style="display:block;width:100%;height:auto">
<p style="margin:16px 0 0"><a href="https://www.lefil.example/numero/${issue}" style="color:#1d4ed8">Lire le numéro complet</a></p></td></tr>
<tr><td style="padding:16px 32px;font-size:12px;color:#98a2b3">Vous recevez ce message car vous êtes abonné·e au Fil Tech.
<a href="https://www.lefil.example/desinscription" style="color:#98a2b3">Se désinscrire</a>
<img src="https://track.lefil.example/open/${issue}.gif" width="1" height="1" alt=""></td></tr></table></body></html>`;
}

const conversations = [
  {
    key: 'atlas',
    subject: 'Lancement du projet Atlas',
    messages: [
      { from: 'claire', cc: ['thomas'], text: 'Bonjour Alice,\n\nNous lançons le projet Atlas lundi. Je propose un point de cadrage à 10h dans la salle Rivoli.\nPeux-tu préparer un premier découpage des lots ?\n\nMerci,' },
      { from: 'alice', to: ['claire'], cc: ['thomas'], text: 'Bonjour Claire,\n\nC\'est noté pour lundi 10h. J\'apporterai une proposition de découpage en trois lots.' },
      { from: 'thomas', to: ['alice', 'claire'], text: 'Parfait, je réserve la salle et j\'invite l\'équipe produit.' },
      { from: 'claire', to: ['alice'], cc: ['thomas'], text: 'Merci à vous deux. J\'ajoute l\'ordre du jour en pièce jointe.', attachment: { filename: 'ordre-du-jour-atlas.pdf', type: 'application/pdf', content: pdf('Ordre du jour Atlas') } },
    ],
  },
  {
    key: 'devis',
    subject: 'Devis refonte du site — version 2',
    messages: [
      { from: 'sophie', text: 'Bonjour,\n\nVous trouverez ci-joint la version 2 du devis, qui intègre la migration du blog et la formation.\nJe reste disponible pour en discuter.\n\nBien cordialement,', attachment: { filename: 'devis-refonte-v2.pdf', type: 'application/pdf', content: pdf('Devis refonte v2') } },
      { from: 'alice', to: ['sophie'], text: 'Bonjour Sophie,\n\nMerci pour ce devis. Pourriez-vous détailler le poste « migration du blog » ? Le reste nous convient.' },
    ],
  },
  {
    key: 'candidature',
    subject: 'Candidature — Développeuse React Native',
    messages: [
      { from: 'nadia', text: 'Bonjour,\n\nJe vous adresse ma candidature pour le poste de développeuse React Native.\nVous trouverez mon CV en pièce jointe.\n\nCordialement,', attachment: { filename: 'cv-nadia-benali.pdf', type: 'application/pdf', content: pdf('CV Nadia Benali') } },
      { from: 'alice', to: ['nadia'], text: 'Bonjour Nadia,\n\nMerci pour votre candidature. Seriez-vous disponible jeudi pour un premier échange en visio ?' },
      { from: 'nadia', to: ['alice'], text: 'Bonjour,\n\nJeudi me convient très bien, à partir de 14h.\n\nBonne journée,' },
    ],
  },
  {
    key: 'preprod',
    subject: 'Accès au serveur de préproduction',
    messages: [
      { from: 'hugo', text: 'Salut Alice,\n\nTu peux me donner un accès SSH à la préproduction ? Je dois vérifier la configuration du cache.' },
      { from: 'alice', to: ['hugo'], text: 'C\'est fait, ta clé est ajoutée. L\'accès expire dans 7 jours.' },
      { from: 'hugo', to: ['alice'], text: 'Merci, ça fonctionne.' },
    ],
  },
  {
    key: 'bilan',
    subject: 'Bilan 2026 — documents à transmettre',
    messages: [
      { from: 'ines', text: 'Bonjour Madame Durand,\n\nPour finaliser le bilan, il me manque les relevés de novembre et la liste des immobilisations.\n\nCordialement,', attachment: { filename: 'liste-pieces.csv', type: 'text/csv; charset=utf-8', content: Buffer.from('Pièce;Statut\nRelevés novembre;Manquant\nImmobilisations;Manquant\n') } },
    ],
  },
  {
    key: 'meeting',
    subject: 'Meeting next week',
    messages: [
      { from: 'daniel', text: 'Hi Alice,\n\nAre you available on Tuesday afternoon to go through the integration plan?\n\nBest regards,' },
      { from: 'alice', to: ['daniel'], text: 'Hi Daniel,\n\nTuesday at 3pm works for me. I will send an invitation.' },
    ],
  },
  {
    key: 'propuesta',
    subject: 'Propuesta de colaboración',
    messages: [
      { from: 'laura', text: 'Hola Alice,\n\nTe escribo para proponerte una colaboración en el proyecto de traducción de la aplicación.\n\nUn saludo,' },
    ],
  },
  {
    key: 'retour',
    subject: 'Retour sur la maquette',
    messages: [
      { from: 'marco', text: 'Bonjour Alice,\n\nLa nouvelle maquette est beaucoup plus lisible. Deux remarques : le contraste des boutons secondaires et la taille des titres sur mobile.' },
    ],
  },
];

const notifications = [
  (index) => ({ from: services.hosting, subject: 'Nouvelle connexion à votre espace client', text: `Une connexion à votre espace client a été détectée depuis un nouvel appareil.\nSi vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe.\n\nRéférence : CNX-${10240 + index}` }),
  (index) => ({ from: services.billing, subject: `Facture n° 2026-${String(4100 + index).padStart(5, '0')} disponible`, text: 'Bonjour,\n\nVotre facture est disponible en pièce jointe.\n\nL\'équipe Facturation', attachment: { filename: `facture-2026-${4100 + index}.pdf`, type: 'application/pdf', content: pdf(`Facture ${4100 + index}`) } }),
  (index) => ({ from: services.parcel, subject: 'Votre colis est en cours de livraison', text: `Votre colis n° CE${880000 + index}FR sera livré aujourd'hui entre 9h et 13h.` }),
  (index) => ({ from: services.calendar, subject: 'Rappel : réunion d\'équipe demain à 10:00', text: `Réunion d'équipe hebdomadaire\nDemain, 10:00 – 10:45\nSalle Rivoli\n\nÉvénement n°${index}` }),
  (index) => ({ from: services.bank, subject: 'Votre relevé mensuel est disponible', text: `Votre relevé du mois est disponible dans votre espace.\nRéférence : REL-${2000 + index}` }),
  (index) => ({ from: services.newsletter, subject: `Le Fil Tech — n°${40 + index}`, text: `Ce qu'il fallait retenir cette semaine. Lire le numéro : https://www.lefil.example/numero/${40 + index}`, html: newsletterHtml(40 + index), inlineImages: [{ type: 'image/png', filename: 'logo.png', contentId: 'logo@lefil.example', content: LOGO_PNG }], headers: listHeaders('lefil.example') }),
  (index) => ({ from: services.shop, subject: `Black Friday : -${20 + (index % 4) * 10} % sur toute la boutique`, text: 'Nos lampes et nos luminaires à prix réduit jusqu\'à dimanche.\n\nVoir les offres : https://boutique.example/black-friday', headers: [...listHeaders('boutique.example'), 'X-Mailin-Campaign: 4211'] }),
  (index) => ({ from: services.orders, subject: `Votre commande n° ${4521 + index} a été expédiée`, text: `Votre commande n° ${4521 + index} est en route. Suivez-la : https://boutique.example/suivi/${4521 + index}` }),
  (index) => ({ from: services.forum, subject: '[Forum Rust FR] Nouvelle réponse dans « Async et lifetimes »', text: `Hugo a répondu au sujet « Async et lifetimes ».\n\nRéponse n°${index}`, headers: ['List-Id: <rust.forum.example>', 'Auto-Submitted: auto-generated'] }),
  (index) => ({ from: services.login, subject: `${String(482910 + index * 7).slice(-6)} est votre code de connexion`, text: 'Saisissez ce code pour vous connecter. Il expire dans 10 minutes.', headers: ['Auto-Submitted: auto-generated'] }),
];

class Mailboxes {
  folders = new Map();

  add(user, folder, message) {
    const key = `${user}\u0000${folder}`;
    if (!this.folders.has(key)) this.folders.set(key, { user, folder, messages: [] });
    this.folders.get(key).messages.push(message);
  }

  byUser() {
    const result = new Map();
    for (const { user, folder, messages } of this.folders.values()) {
      if (!result.has(user)) result.set(user, new Map());
      result.get(user).set(folder, messages.sort((left, right) => left.date - right.date));
    }
    return result;
  }
}

function personOf(key) {
  return key === 'alice' ? alice : people[key];
}

function addConversation(mailboxes, conversation, start, random) {
  const ids = [];
  let date = start;
  conversation.messages.forEach((message, index) => {
    date = new Date(date.getTime() + (20 + random() * 240) * MINUTE);
    const from = personOf(message.from);
    const to = (message.to ?? ['alice']).map(personOf);
    const cc = (message.cc ?? []).map(personOf);
    const messageId = `${conversation.key}.${index}.${start.getTime()}@example.com`;
    const raw = buildMessage({
      from,
      to,
      cc,
      subject: index === 0 ? conversation.subject : `Re: ${conversation.subject}`,
      date,
      messageId,
      inReplyTo: ids.at(-1),
      references: ids,
      text: message.text + (message.from === 'alice' ? signature(alice) : signature(from)),
      attachments: message.attachment ? [message.attachment] : [],
    });
    ids.push(messageId);
    const fromAlice = message.from === 'alice';
    const isLast = index === conversation.messages.length - 1;
    mailboxes.add(alice.email, fromAlice ? 'Sent' : 'INBOX', {
      raw,
      date,
      flags: fromAlice || !isLast ? ['\\Seen'] : random() < 0.5 ? ['\\Seen'] : [],
    });
  });
}

function addNotification(mailboxes, folder, index, date, random) {
  const template = notifications[index % notifications.length](index);
  const raw = buildMessage({
    from: template.from,
    to: [alice],
    subject: template.subject,
    date,
    messageId: `notification.${index}.${date.getTime()}@example.com`,
    text: template.text,
    html: template.html,
    inlineImages: template.inlineImages ?? [],
    attachments: template.attachment ? [template.attachment] : [],
    headers: template.headers,
  });
  const flags = random() < 0.75 ? ['\\Seen'] : [];
  if (random() < 0.05) flags.push('\\Flagged');
  mailboxes.add(alice.email, folder, { raw, date, flags });
}

export function buildDataset({ inboxSize, now = new Date() }) {
  const random = createRandom(20261108);
  const mailboxes = new Mailboxes();

  conversations.forEach((conversation, index) => {
    const start = new Date(now.getTime() - (index * 1.7 + 0.3) * DAY);
    addConversation(mailboxes, conversation, start, random);
  });

  const generated = Math.max(0, inboxSize - conversations.reduce((total, conversation) => total + conversation.messages.length, 0));
  const span = inboxSize > 500 ? 28 * DAY : 45 * DAY;
  for (let index = 0; index < generated; index += 1) {
    const date = new Date(now.getTime() - (index / Math.max(generated, 1)) * span - random() * 2 * 60 * MINUTE - 5 * MINUTE);
    addNotification(mailboxes, 'INBOX', index, date, random);
  }

  for (let index = 0; index < 30; index += 1) {
    addNotification(mailboxes, 'Archive', 1000 + index, new Date(now.getTime() - (10 + index * 2) * DAY), random);
  }
  for (let index = 0; index < 4; index += 1) {
    addNotification(mailboxes, 'Trash', 2000 + index, new Date(now.getTime() - (index + 1) * DAY), random);
  }
  for (let index = 0; index < 3; index += 1) {
    const date = new Date(now.getTime() - (index + 2) * DAY);
    mailboxes.add(alice.email, 'Junk', {
      raw: buildMessage({ from: services.spam, to: [alice], subject: 'Félicitations, vous avez été sélectionné(e) !', date, messageId: `spam.${index}@promo-offres.example`, text: 'Cliquez ici pour réclamer votre récompense.' }),
      date,
      flags: [],
    });
  }
  const draftDate = new Date(now.getTime() - 3 * 60 * MINUTE);
  mailboxes.add(alice.email, 'Drafts', {
    raw: buildMessage({ from: alice, to: [people.marco], subject: 'Re: Retour sur la maquette', date: draftDate, messageId: `draft.1@example.com`, text: 'Bonjour Marco,\n\nMerci pour ces remarques, je reprends' }),
    date: draftDate,
    flags: ['\\Seen', '\\Draft'],
  });
  for (let index = 0; index < 6; index += 1) {
    const date = new Date(now.getTime() - (index * 3 + 1) * DAY);
    mailboxes.add(alice.email, 'Projets.Clients', {
      raw: buildMessage({ from: people.claire, to: [alice], subject: `Compte rendu client — semaine ${46 - index}`, date, messageId: `client.${index}@lumen.example`, text: 'Bonjour,\n\nVoici le compte rendu de la semaine : avancement conforme, prochaine livraison vendredi.' + signature(people.claire) }),
      date,
      flags: ['\\Seen'],
    });
  }
  for (let index = 0; index < 5; index += 1) {
    const date = new Date(now.getTime() - (index + 1) * 5 * 60 * MINUTE);
    mailboxes.add(bob.email, 'INBOX', {
      raw: buildMessage({ from: people.julien, to: [bob], subject: `Point hebdomadaire n°${index + 1}`, date, messageId: `bob.${index}@mail.example`, text: 'Salut Bob,\n\nOn fait le point demain matin ?' + signature(people.julien) }),
      date,
      flags: index > 1 ? ['\\Seen'] : [],
    });
  }
  return mailboxes.byUser();
}
