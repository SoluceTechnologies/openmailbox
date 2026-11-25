pub const CLASSIFIER_VERSION: i64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash)]
pub enum Category {
    #[default]
    Primary,
    Transactions,
    Updates,
    Promotions,
}

impl Category {
    pub fn code(self) -> i64 {
        self as i64
    }

    pub fn from_code(code: i64) -> Category {
        match code {
            1 => Category::Transactions,
            2 => Category::Updates,
            3 => Category::Promotions,
            _ => Category::Primary,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SendingSignals {
    pub bulk: bool,
    pub automated: bool,
    pub marketing: bool,
    pub one_click: bool,
}

impl SendingSignals {
    pub fn bits(self) -> i64 {
        i64::from(self.bulk)
            | i64::from(self.automated) << 1
            | i64::from(self.marketing) << 2
            | i64::from(self.one_click) << 3
    }

    pub fn from_bits(bits: i64) -> SendingSignals {
        SendingSignals {
            bulk: bits & 1 != 0,
            automated: bits & 1 << 1 != 0,
            marketing: bits & 1 << 2 != 0,
            one_click: bits & 1 << 3 != 0,
        }
    }
}

const NO_REPLY: &[&str] = &[
    "noreply",
    "donotreply",
    "dontreply",
    "nepasrepondre",
    "noreponse",
    "norespond",
    "nonrispondere",
    "noresponder",
    "nichtantworten",
    "naoresponda",
    "nietantwoorden",
];

const PROGRAM_SENDERS: &[&str] = &[
    "notification",
    "notifications",
    "notify",
    "notifier",
    "notice",
    "notices",
    "alert",
    "alerts",
    "alerte",
    "alertes",
    "info",
    "infos",
    "information",
    "informations",
    "hello",
    "bonjour",
    "news",
    "newsletter",
    "newsletters",
    "mailer",
    "updates",
    "update",
    "team",
    "equipe",
    "service",
    "services",
    "account",
    "accounts",
    "compte",
    "security",
    "securite",
    "digest",
    "automated",
    "auto",
    "bounce",
    "bounces",
    "postmaster",
    "robot",
    "bot",
    "system",
    "community",
    "members",
    "events",
    "calendar",
    "feedback",
    "survey",
    "surveys",
    "enquete",
    "enquetes",
    "learn",
    "weekly",
    "daily",
    "monthly",
    "welcome",
    "bienvenue",
];

const SENDING_SUBDOMAINS: &[&str] = &[
    "email",
    "emails",
    "e",
    "em",
    "m",
    "mail",
    "mailing",
    "mailer",
    "mg",
    "send",
    "notifications",
    "notification",
    "notify",
    "notices",
    "alerts",
    "alertes",
    "reply",
    "bounce",
    "mta",
    "services",
    "accounts",
];

const TRANSACTION_SENDERS: &[&str] = &[
    "receipt",
    "receipts",
    "invoice",
    "invoices",
    "billing",
    "payment",
    "payments",
    "paiement",
    "paiements",
    "facturation",
    "facture",
    "factures",
    "factura",
    "facturas",
    "fattura",
    "fatture",
    "rechnung",
    "rechnungen",
    "factuur",
    "facturen",
    "fatura",
    "order",
    "orders",
    "commande",
    "commandes",
    "bestellung",
    "pedido",
    "pedidos",
    "ordine",
    "ordini",
    "bestelling",
    "encomenda",
    "shipping",
    "shipment",
    "tracking",
    "suivi",
    "livraison",
    "delivery",
    "versand",
    "booking",
    "bookings",
    "reservation",
    "reservations",
    "reservierung",
    "reserva",
    "prenotazioni",
    "boeking",
    "transaction",
    "transactions",
    "transactional",
    "statements",
    "purchase",
    "purchases",
    "ticketing",
    "billetterie",
];

const MARKETING_SENDERS: &[&str] = &[
    "marketing",
    "market",
    "promo",
    "promos",
    "promotion",
    "promotions",
    "deals",
    "deal",
    "offers",
    "offer",
    "offres",
    "offre",
    "sales",
    "vip",
    "soldes",
    "bonsplans",
    "campaign",
    "campaigns",
];

const MARKETING_SUBDOMAINS: &[(&str, i32)] = &[
    ("marketing", 3),
    ("mkt", 3),
    ("promo", 3),
    ("promos", 3),
    ("promotion", 3),
    ("promotions", 3),
    ("deals", 3),
    ("offers", 3),
    ("offres", 3),
    ("campaign", 3),
    ("campaigns", 3),
    ("emailing", 3),
    ("emarketing", 3),
    ("vip", 3),
    ("engage", 3),
    ("newarrival", 3),
    ("news", 2),
    ("newsletter", 2),
    ("newsletters", 2),
    ("info", 2),
    ("infos", 2),
    ("actu", 2),
    ("actus", 2),
    ("inspiration", 2),
];

const GREETING_SENDERS: &[&str] = &[
    "info",
    "infos",
    "informations",
    "hello",
    "bonjour",
    "contact",
    "team",
    "community",
    "members",
    "welcome",
    "club",
    "news",
    "newsletter",
];

const PLATFORMS: &[&str] = &[
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "atlassian.net",
    "atlassian.com",
    "sentry.io",
    "vercel.com",
    "netlify.com",
    "slack.com",
    "discord.com",
    "discordapp.com",
    "discoursemail.com",
    "googlegroups.com",
    "groups.io",
    "meetup.com",
    "linkedin.com",
    "facebookmail.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "redditmail.com",
    "pinterest.com",
    "youtube.com",
    "tiktok.com",
    "quora.com",
    "medium.com",
    "substack.com",
    "strava.com",
    "nextdoor.com",
    "tumblr.com",
    "twitch.tv",
    "goodreads.com",
    "trello.com",
    "asana.com",
    "notion.so",
    "figma.com",
    "stackoverflow.email",
    "producthunt.com",
];

const SPAM_TAGS: &[&str] = &[
    "[spam",
    "***spam",
    "*** spam",
    "[suspected spam",
    "[possible spam",
    "spam:",
];

const BOUNCES: &[&str] = &[
    "undelivered mail",
    "undeliverable",
    "delivery status notification",
    "mail delivery failed",
    "delivery failure",
    "delivery has failed",
    "returned mail",
    "failure notice",
    "non remis",
    "non distribuable",
    "echec de la remise",
    "echec de remise",
    "unzustellbar",
    "nicht zustellbar",
    "no se pudo entregar",
    "mancato recapito",
    "onbestelbaar",
    "nao entregue",
    "недоставлен*",
];

const TIME_SENSITIVE: &[&str] = &[
    "verify your",
    "please verify",
    "verify email",
    "verify account",
    "verify it s you",
    "verification code",
    "verification link",
    "verification required",
    "email verification",
    "account verification",
    "identity verification",
    "verifiez votre",
    "verifier votre",
    "verification de votre",
    "code de verification",
    "lien de verification",
    "verification requise",
    "verifizieren sie",
    "verifizierungscode",
    "verifica tu",
    "codigo de verificacion",
    "verifica il tuo",
    "verifica la tua",
    "codice di verifica",
    "verifieer je",
    "verifieer uw",
    "verificatiecode",
    "verifique seu",
    "verifique o seu",
    "codigo de verificacao",
    "код проверки",
    "login code",
    "log in code",
    "sign in code",
    "signin code",
    "access code",
    "security code",
    "one time code",
    "one time password",
    "one time passcode",
    "otp",
    "2fa",
    "mfa",
    "two factor",
    "two step",
    "2 step",
    "code de connexion",
    "code de securite",
    "code d acces",
    "code a usage unique",
    "code temporaire",
    "authentication",
    "authentification",
    "authentifizierung",
    "autenticacion",
    "autenticazione",
    "authenticatie",
    "autenticacao",
    "bestatigungscode",
    "sicherheitscode",
    "anmeldecode",
    "codigo de seguridad",
    "codice di sicurezza",
    "beveiligingscode",
    "codigo de seguranca",
    "код подтверждения",
    "confirm your email",
    "confirm your account",
    "confirm your subscription",
    "confirm your registration",
    "please confirm",
    "confirmez votre",
    "confirmer votre adresse",
    "confirmer votre compte",
    "confirmer votre inscription",
    "bestatigen sie",
    "confirma tu",
    "conferma il tuo",
    "conferma la tua",
    "bevestig je",
    "bevestig uw",
    "confirme seu",
    "confirme o seu",
    "подтвердите",
    "activate your account",
    "activez votre compte",
    "activer votre compte",
    "password*",
    "passwort*",
    "mot de passe",
    "mots de passe",
    "contrasena*",
    "senha",
    "wachtwoord",
    "пароль*",
    "reinitialis*",
    "reset your",
    "magic link",
    "secure link",
    "sign in link",
    "login link",
    "lien securise",
    "lien de connexion",
    "anmeldelink",
    "enlace de inicio de sesion",
    "link di accesso",
    "inloglink",
    "ссылка для входа",
    "security alert",
    "alerte de securite",
    "alerte securite",
    "sicherheitswarnung",
    "sicherheitshinweis",
    "alerta de seguridad",
    "avviso di sicurezza",
    "beveiligingsmelding",
    "alerta de seguranca",
    "оповещение о безопасности",
    "new login",
    "new sign in",
    "new signin",
    "nouvelle connexion",
    "neue anmeldung",
    "nuevo inicio de sesion",
    "nuovo accesso",
    "nieuwe aanmelding",
    "novo login",
    "новый вход",
    "new device",
    "nouvel appareil",
    "neues gerat",
    "nuevo dispositivo",
    "nuovo dispositivo",
    "nieuw apparaat",
    "novo dispositivo",
    "новое устройство",
    "trusted device",
    "appareil de confiance",
    "registered to your",
    "unusual activity",
    "unusual sign in",
    "suspicious",
    "activite inhabituelle",
    "connexion inhabituelle",
    "activite suspecte",
    "connexion suspecte",
    "verdachtige",
    "sospechos*",
    "sospett*",
    "suspeit*",
    "подозрительн*",
    "account locked",
    "account suspended",
    "compte bloque",
    "compte verrouille",
    "compte suspendu",
];

const CODE_WORDS: &[&str] = &["code", "codigo", "codice", "код", "pin", "otp"];

const TRANSACTIONS: &[&str] = &[
    "order confirmation",
    "order confirmed",
    "confirmation de commande",
    "commande confirmee",
    "bestellbestatigung",
    "confirmacion de pedido",
    "conferma d ordine",
    "conferma ordine",
    "orderbevestiging",
    "confirmacao de encomenda",
    "подтверждение заказа",
    "receipt*",
    "votre recu",
    "recu d achat",
    "recu de paiement",
    "recu de commande",
    "recu de transaction",
    "recu fiscal",
    "recus fiscaux",
    "quittung",
    "kassenbon",
    "recibo*",
    "ricevuta",
    "ontvangstbewijs",
    "чек",
    "invoice*",
    "facture*",
    "factura*",
    "fattura*",
    "factuur",
    "facturen",
    "fatura*",
    "rechnung*",
    "счет",
    "счета",
    "your statement",
    "account statement",
    "bank statement",
    "card statement",
    "statement is",
    "releve*",
    "kontoauszug",
    "extracto",
    "estratto conto",
    "afschrift",
    "extrato",
    "выписк*",
    "payment*",
    "paiement*",
    "zahlung*",
    "pago",
    "pagos",
    "pagamento*",
    "betaling*",
    "оплат*",
    "платеж*",
    "refund*",
    "rembours*",
    "erstattung",
    "ruckerstattung",
    "reembolso*",
    "rimborso",
    "terugbetaling",
    "возврат*",
    "transaction*",
    "virement",
    "prelevement",
    "uberweisung",
    "transferencia",
    "bonifico",
    "overschrijving",
    "payout",
    "paid",
    "paye",
    "payee",
    "bezahlt",
    "pagado",
    "pagato",
    "betaald",
    "shipped",
    "shipment",
    "expedi*",
    "versandt",
    "verschickt",
    "enviado",
    "spedit*",
    "verzonden",
    "despachad*",
    "отправлен*",
    "delivered",
    "livree",
    "geliefert",
    "zugestellt",
    "entregado",
    "consegnat*",
    "bezorgd",
    "geleverd",
    "entregue",
    "доставлен*",
    "out for delivery",
    "en cours de livraison",
    "in zustellung",
    "en reparto",
    "in consegna",
    "colis",
    "parcel",
    "paket",
    "paquete",
    "pacco",
    "pakket",
    "посылк*",
    "tracking number",
    "numero de suivi",
    "suivi de colis",
    "suivi de commande",
    "suivi de livraison",
    "sendungsverfolgung",
    "numero de seguimiento",
    "numero di tracciamento",
    "track your",
    "suivez votre",
    "booking*",
    "reservation*",
    "buchung*",
    "reservierung*",
    "reserva*",
    "prenotazion*",
    "boeking*",
    "бронир*",
    "ticket*",
    "billet*",
    "eticket",
    "e ticket",
    "boarding pass",
    "carte d embarquement",
    "bordkarte",
    "tarjeta de embarque",
    "carta d imbarco",
    "instapkaart",
    "cartao de embarque",
    "посадочн*",
    "itinerary",
    "itineraire",
    "reiseplan",
    "itinerario",
    "reisschema",
    "flight confirmation",
    "confirmation de vol",
];

const TRANSACTIONS_WEAK: &[&str] = &[
    "order",
    "orders",
    "ordered",
    "commande",
    "commandes",
    "bestellung",
    "bestellt",
    "pedido",
    "pedidos",
    "ordine",
    "bestelling",
    "encomenda",
    "заказ*",
    "purchase*",
    "achat*",
    "kauf",
    "einkauf",
    "compra*",
    "acquisto",
    "aankoop",
    "покупк*",
    "subscription*",
    "your plan",
    "your new plan",
    "votre plan",
    "votre nouveau plan",
    "abonnement*",
    "suscripcion*",
    "abbonamento",
    "assinatura",
    "подписк*",
    "renew*",
    "renouvel*",
    "verlangerung",
    "renovacion",
    "rinnovo",
    "verlenging",
    "renovacao",
    "продлен*",
    "membership",
    "adhesion",
    "mitgliedschaft",
    "membresia",
    "lidmaatschap",
    "delivery",
    "deliveries",
    "livraison*",
    "lieferung",
    "envio",
    "entrega*",
    "consegna",
    "levering",
    "bezorging",
    "доставк*",
    "shipping",
    "versand",
    "spedizione",
    "verzending",
    "trip",
    "trips",
    "ride",
    "rides",
    "voyage",
    "sejour",
    "trial",
    "flight",
    "flights",
    "vol",
    "flug",
    "vuelo",
    "volo",
    "vlucht",
    "voo",
    "рейс",
];

const POSSESSIVES: &[&str] = &[
    "your", "votre", "vos", "ton", "ta", "tes", "dein*", "ihr", "ihre", "ihren", "ihrer", "ihres",
    "su", "sus", "tu", "tus", "tuo", "tua", "tuoi", "tue", "uw", "jouw", "seu", "sua", "seus",
    "suas", "ваш*", "твой", "твоя", "твои",
];

const NEWSLETTERS: &[&str] = &[
    "news",
    "newsletter*",
    "digest",
    "recap",
    "roundup",
    "this week in",
    "cette semaine",
    "edition",
];

const PROMOTIONS: &[&str] = &[
    "sale",
    "sales",
    "promo*",
    "discount*",
    "coupon*",
    "deal",
    "deals",
    "offer",
    "offers",
    "limited time",
    "last chance",
    "ends tonight",
    "ends soon",
    "today only",
    "free",
    "freebie*",
    "save",
    "savings",
    "black friday",
    "cyber monday",
    "new arrivals",
    "new collection",
    "exclusive*",
    "giveaway",
    "bonus",
    "reward*",
    "early access",
    "clearance",
    "gift*",
    "win",
    "soldes",
    "offre*",
    "offert*",
    "reduc*",
    "remise*",
    "rabais",
    "prix reduit*",
    "petits prix",
    "gratuit*",
    "bon plan*",
    "bons plans",
    "vente privee",
    "ventes privees",
    "derniere chance",
    "derniers jours",
    "dernier jour",
    "french days",
    "exclusi*",
    "nouveaute*",
    "nouvelle collection",
    "decouvrez",
    "economisez",
    "profitez",
    "jusqu a",
    "cadeau*",
    "concours",
    "gagnez",
    "a gagner",
    "parrain*",
    "angebot*",
    "rabatt*",
    "gutschein*",
    "nur heute",
    "kostenlos*",
    "gratis",
    "sparen",
    "exklusiv*",
    "schnappchen",
    "neuheit*",
    "oferta*",
    "descuento*",
    "rebaja*",
    "envio gratis",
    "ahorra",
    "regalo*",
    "novedad*",
    "offerta*",
    "offerte",
    "sconto*",
    "sconti",
    "saldi",
    "risparmia",
    "esclusiv*",
    "novita",
    "aanbieding*",
    "korting*",
    "uitverkoop",
    "bespaar*",
    "desconto*",
    "promocao",
    "promocoes",
    "economize",
    "brinde",
    "novidade*",
    "скидк*",
    "распродаж*",
    "акци*",
    "бесплатн*",
    "выгод*",
    "подарок*",
];

fn fold(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            'à' | 'â' | 'ä' | 'á' | 'ã' | 'å' => 'a',
            'ç' => 'c',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ñ' => 'n',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ÿ' => 'y',
            'ё' => 'е',
            other => other,
        })
        .collect()
}

fn words(text: &str) -> Vec<&str> {
    text.split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect()
}

fn mentions(words: &[&str], terms: &[&str]) -> bool {
    let matches = |word: &str, part: &str| match part.strip_suffix('*') {
        Some(stem) => word.starts_with(stem),
        None => word == part,
    };
    terms.iter().any(|term| {
        (0..words.len()).any(|start| {
            let mut next = words[start..].iter();
            term.split(' ')
                .all(|part| next.next().is_some_and(|word| matches(word, part)))
        })
    })
}

fn mentions_a_reference(text: &str, words: &[&str]) -> bool {
    let numbered = |marker: &str| {
        text.match_indices(marker).any(|(index, _)| {
            text[index + marker.len()..]
                .trim_start()
                .starts_with(|character: char| character.is_ascii_digit())
        })
    };
    ["#", "n°", "nº", "№"].into_iter().any(numbered)
        || words.iter().any(|word| {
            let digits = word.chars().filter(char::is_ascii_digit).count();
            digits >= 5 || (digits >= 3 && digits < word.chars().count())
        })
}

fn mentions_an_amount(text: &str) -> bool {
    const CURRENCIES: &[char] = &['€', '$', '£', '¥', '₽', '₹'];
    text.char_indices().any(|(index, character)| {
        let after = &text[index + character.len_utf8()..];
        let follows_a_number = text[..index]
            .trim_end()
            .ends_with(|digit: char| digit.is_ascii_digit());
        (character == '%' && follows_a_number)
            || (CURRENCIES.contains(&character)
                && (follows_a_number
                    || after
                        .trim_start()
                        .starts_with(|digit: char| digit.is_ascii_digit())))
    })
}

fn mentions_an_emoji(text: &str) -> bool {
    text.chars().any(|character| {
        matches!(character as u32, 0x1F000..=0x1FAFF | 0x2300..=0x23FF | 0x2600..=0x27BF | 0x2B00..=0x2BFF | 0xFE0F)
    })
}

fn quotes_content(text: &str) -> bool {
    const REPLIES: &[&str] = &[
        "re:", "re :", "fwd:", "fw:", "tr:", "tr :", "aw:", "wg:", "rv:", "r:",
    ];
    let trimmed = text.trim_start();
    REPLIES.iter().any(|prefix| trimmed.starts_with(prefix))
        || text.split('[').skip(1).any(|tag| {
            tag.split_once(']')
                .is_some_and(|(inside, _)| inside.contains('/'))
        })
}

fn mentions_a_code(text: &str, words: &[&str]) -> bool {
    mentions(words, CODE_WORDS)
        && !mentions(words, PROMOTIONS)
        && !mentions_an_amount(text)
        && words.iter().any(|word| {
            (4..=8).contains(&word.len())
                && word.bytes().all(|byte| byte.is_ascii_digit())
                && !(word.len() == 4 && (word.starts_with("19") || word.starts_with("20")))
        })
}

pub fn classify(sender: Option<&str>, subject: Option<&str>, signals: SendingSignals) -> Category {
    let sender = fold(sender.unwrap_or_default());
    let (local_part, domain) = sender.rsplit_once('@').unwrap_or((sender.as_str(), ""));
    let local = words(local_part);
    let joined = local.concat();
    let labels: Vec<&str> = domain.split('.').collect();
    let subdomain: Vec<&str> = labels[..labels.len().saturating_sub(2)]
        .iter()
        .flat_map(|label| words(label))
        .collect();
    let named = |names: &[&str]| local.iter().any(|word| names.contains(word));
    let labelled = |names: &[&str]| subdomain.iter().any(|word| names.contains(word));

    let text = fold(subject.unwrap_or_default());
    let subject = words(&text);

    if SPAM_TAGS
        .iter()
        .any(|tag| text.trim_start().starts_with(tag))
    {
        return Category::Promotions;
    }
    let from_platform = PLATFORMS.iter().any(|platform| {
        domain
            .strip_suffix(platform)
            .is_some_and(|rest| rest.is_empty() || rest.ends_with('.'))
    });
    let sends_transactions = named(TRANSACTION_SENDERS) || labelled(TRANSACTION_SENDERS);
    let sells = named(MARKETING_SENDERS);
    let program = signals.bulk
        || signals.automated
        || signals.marketing
        || from_platform
        || sends_transactions
        || sells
        || NO_REPLY.iter().any(|name| joined.contains(name))
        || joined == "mailerdaemon"
        || named(PROGRAM_SENDERS)
        || labelled(SENDING_SUBDOMAINS)
        || labelled(PROGRAM_SENDERS);
    if !program {
        return Category::Primary;
    }
    if joined == "mailerdaemon" || named(&["postmaster"]) || mentions(&subject, BOUNCES) {
        return Category::Primary;
    }
    if !quotes_content(&text)
        && (mentions(&subject, TIME_SENSITIVE) || mentions_a_code(&text, &subject))
    {
        return Category::Primary;
    }
    if sends_transactions {
        return Category::Transactions;
    }
    if from_platform {
        return Category::Updates;
    }

    let mut promotion = 0;
    if signals.marketing || sells {
        promotion += 3;
    }
    promotion += MARKETING_SUBDOMAINS
        .iter()
        .filter(|(label, _)| subdomain.contains(label))
        .map(|(_, weight)| weight)
        .max()
        .unwrap_or(&0);
    if mentions(&subject, PROMOTIONS) {
        promotion += 2;
    }
    if mentions_an_amount(&text) {
        promotion += 2;
    }
    if mentions_an_emoji(&text) {
        promotion += 1;
    }
    if text.contains(|character| character == '!' || character == '¡') {
        promotion += 1;
    }
    if signals.one_click {
        promotion += 1;
    }
    if signals.bulk && named(GREETING_SENDERS) {
        promotion += 1;
    }

    let mut transaction = 0;
    if !mentions(&subject, NEWSLETTERS) {
        if mentions(&subject, TRANSACTIONS) {
            transaction += 2;
        }
        if mentions(&subject, TRANSACTIONS_WEAK) {
            transaction += 1;
        }
        if transaction > 0 && mentions(&subject, POSSESSIVES) {
            transaction += 1;
        }
        if transaction > 0 && mentions_a_reference(&text, &subject) {
            transaction += 1;
        }
    }

    if transaction >= 2 && transaction >= promotion {
        Category::Transactions
    } else if promotion >= 3 {
        Category::Promotions
    } else {
        Category::Updates
    }
}

#[cfg(test)]
#[path = "../../../tests/mail_model/category.rs"]
mod tests;
