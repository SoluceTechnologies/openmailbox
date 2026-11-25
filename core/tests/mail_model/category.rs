use super::*;

const PLAIN: SendingSignals = SendingSignals {
    bulk: false,
    automated: false,
    marketing: false,
    one_click: false,
};
const LIST: SendingSignals = SendingSignals {
    bulk: true,
    ..PLAIN
};
const CAMPAIGN: SendingSignals = SendingSignals {
    bulk: true,
    one_click: true,
    ..PLAIN
};
const AUTOMATED: SendingSignals = SendingSignals {
    automated: true,
    ..PLAIN
};
const MARKETING: SendingSignals = SendingSignals {
    marketing: true,
    ..PLAIN
};

fn assert_classified(category: Category, cases: &[(&str, &str, SendingSignals)]) {
    for (sender, subject, signals) in cases {
        assert_eq!(
            classify(Some(sender), Some(subject), *signals),
            category,
            "{sender}: {subject}"
        );
    }
}

#[test]
fn people_writing_stay_primary_whatever_they_write_about() {
    assert_classified(
        Category::Primary,
        &[
            (
                "claire.dubois@example.com",
                "Order of the day for Monday",
                PLAIN,
            ),
            ("bob@example.com", "In order to finish the 20% left", PLAIN),
            ("claire@mail.example", "Lunch", PLAIN),
            (
                "sophie@atelier.example",
                "Devis refonte v2 : -10 % sur la formation !",
                PLAIN,
            ),
            (
                "xcwj7s585nvsknxv@messagerie.marketplace.example",
                "Nouveau message pour « Vélo »",
                PLAIN,
            ),
        ],
    );
}

#[test]
fn codes_sign_in_links_and_security_alerts_are_primary() {
    assert_classified(
        Category::Primary,
        &[
            (
                "noreply@tm.chat.example",
                "Your temporary ChatGPT login code",
                PLAIN,
            ),
            (
                "no-reply@accounts.example",
                "482910 is your verification code",
                LIST,
            ),
            (
                "no-reply-xbg-u3ouqd@mail.assistant.example",
                "Your secure link to Claude.ai is here",
                CAMPAIGN,
            ),
            (
                "no-reply@accounts.google.example",
                "Alerte de sécurité pour alice@example.com",
                PLAIN,
            ),
            (
                "noreply@hebergeur.example",
                "Nouvelle connexion à votre espace client",
                PLAIN,
            ),
            ("notifications@link.example", "Verify your email", LIST),
            (
                "no-reply@apps.example",
                "[App Store] Please Confirm Your Email Address",
                PLAIN,
            ),
            (
                "security@service.example",
                "Réinitialisation de votre mot de passe",
                AUTOMATED,
            ),
            (
                "no-reply@mail.assistant.example",
                "Security alert: new trusted device added",
                CAMPAIGN,
            ),
            (
                "noreply@github.com",
                "[GitHub] Please verify your device",
                PLAIN,
            ),
            (
                "noreply@service.example",
                "A computer was registered to your account",
                PLAIN,
            ),
        ],
    );
}

#[test]
fn bounces_of_the_users_mail_are_primary() {
    assert_classified(
        Category::Primary,
        &[
            (
                "MAILER-DAEMON@mo561.mail-out.example",
                "Undelivered Mail Returned to Sender",
                PLAIN,
            ),
            (
                "postmaster@outlook.example",
                "Undeliverable: Devis",
                AUTOMATED,
            ),
            (
                "noreply@relay.example",
                "Message non remis : Devis",
                AUTOMATED,
            ),
        ],
    );
}

#[test]
fn receipts_payments_deliveries_and_bookings_are_transactions() {
    assert_classified(
        Category::Transactions,
        &[
            (
                "no-reply@shop.example",
                "Your order #4521 has shipped",
                PLAIN,
            ),
            (
                "contact@hotel.example",
                "Confirmation de votre réservation",
                LIST,
            ),
            (
                "billing@cloud.example",
                "Facture n° 2026-04101 disponible",
                PLAIN,
            ),
            (
                "facturation@hebergeur.example",
                "Facture n° 2026-04101 disponible",
                PLAIN,
            ),
            (
                "suivi@colis.example",
                "Votre colis est en cours de livraison",
                PLAIN,
            ),
            (
                "invoice+statements+acct_1reyrs@stripe.example",
                "Your receipt from Anthropic Ireland, Limited #2985-6045",
                LIST,
            ),
            (
                "receipts-france@rides.example",
                "Your ride on Saturday",
                LIST,
            ),
            (
                "noreply@tm.chat.example",
                "Veuillez mettre à jour votre moyen de paiement pour Plus",
                LIST,
            ),
            (
                "noreply@registrar.example",
                "Action requise : Échec du paiement pour le renouvellement de votre domaine",
                PLAIN,
            ),
            ("do-not-reply@studio.example", "Votre reçu d'achat", LIST),
            (
                "do-not-reply@studio.example",
                "Bonjour Charles, nous confirmons la création de votre abonnement",
                LIST,
            ),
            (
                "no-reply-oirc@mail.assistant.example",
                "Your Pro subscription is confirmed",
                CAMPAIGN,
            ),
            (
                "alertes@banque.example",
                "Votre relevé mensuel est disponible",
                PLAIN,
            ),
            (
                "auto-confirm@store.example",
                "Votre commande de 2 articles",
                PLAIN,
            ),
            (
                "no_reply@email.apple.example",
                "Your Membership has been Renewed.",
                LIST,
            ),
            (
                "noreply@airline.example",
                "Votre carte d'embarquement pour Toulouse",
                AUTOMATED,
            ),
            (
                "payments@platform.example",
                "We received your payment of $12.00",
                CAMPAIGN,
            ),
            (
                "noreply@tm.chat.example",
                "ChatGPT - Votre nouveau plan",
                PLAIN,
            ),
        ],
    );
}

#[test]
fn offers_and_brand_marketing_are_promotions() {
    assert_classified(
        Category::Promotions,
        &[
            ("deals@brand.example", "Black Friday : -40 % sur tout", LIST),
            ("hello@brand.example", "Last chance: 20% off", LIST),
            ("team@brand.example", "What's new this month", MARKETING),
            (
                "info@news.marketplace.example",
                "🎉 La livraison Mondial Relay à 0,99 € ce week-end",
                CAMPAIGN,
            ),
            (
                "info@news.marketplace.example",
                "↘️ Les baisses de prix de la semaine",
                CAMPAIGN,
            ),
            (
                "newsletter@news.flashsales.example",
                "Un sommeil de rêve avec Emma Sleep",
                LIST,
            ),
            (
                "info@vip.pizza.example",
                "🧀 Jour férié en vue, raclette bienvenue !",
                LIST,
            ),
            (
                "france@rides-marketing.rides.example",
                "Trust the ride, enjoy the plan",
                LIST,
            ),
            (
                "ae-daily-picks28@deals.shop.example",
                "Expédié depuis votre ville !",
                LIST,
            ),
            ("promotion@shop.example", "Ordinateurs ultra-rapides", PLAIN),
            (
                "zoceane@mg.campaigns.booking-tool.example",
                "Vos préférences concernant le suivi de nos emails",
                LIST,
            ),
            (
                "no-reply@courses.example",
                "⏳LIMITED TIME OFFER - $30 off Annual Subscription",
                LIST,
            ),
            (
                "marketing@engage.design.example",
                "Testez la nouvelle version d'Affinity",
                LIST,
            ),
            ("email@news.broker.example", "Get 50 € in stocks", CAMPAIGN),
            (
                "hello@animations.example",
                "Your Exclusive Pass is live 🎟️",
                LIST,
            ),
            (
                "market@appfast.example",
                "App Developers: Package Name Registration Deadline Is Coming",
                PLAIN,
            ),
            (
                "catrinadou@valves.example",
                "[SPAM] Re:Re:Découvrez nos vannes de contrôle",
                PLAIN,
            ),
            (
                "billing@phish.example",
                "[SPAM] Urgent : Mettez à jour vos informations de facturation",
                PLAIN,
            ),
        ],
    );
}

#[test]
fn newsletters_and_notifications_are_updates() {
    assert_classified(
        Category::Updates,
        &[
            ("editor@weekly.example", "This week in Rust", LIST),
            (
                "notifications@github.com",
                "Re: [repo] Fix the order of the build steps (#602)",
                PLAIN,
            ),
            (
                "notifications@github.com",
                "[SoluceTechnologies/app] Epic: payment screen (#12)",
                PLAIN,
            ),
            ("robot@ci.example", "Build passed", AUTOMATED),
            ("developer@email.apple.example", "Agreement signed", PLAIN),
            (
                "annonces@alertes.realestate.example",
                "1 nouvelle annonce : Toulouse",
                PLAIN,
            ),
            (
                "france@business-email.rides.example",
                "3 reasons to use your Work Profile",
                PLAIN,
            ),
            (
                "info@email.meetup.com",
                "📅 Samedi: Est-ce que vous pouvez assister à « Vernissage – Salon » ?",
                CAMPAIGN,
            ),
            (
                "noreply@medium.com",
                "Why Is Everything Written in Rust Now? | Cordero Core",
                LIST,
            ),
            (
                "team@m.tunnel.example",
                "[ngrok news] No to mystery limits, yes to TCP receipts",
                LIST,
            ),
            ("contact@clinic.example", "Chaque commande compte 💗", LIST),
            (
                "contact@trading.example",
                "Les secrets cachés de l'Order Flow",
                LIST,
            ),
            (
                "no.reply@marketplace.example",
                "Votre annonce « Vélo » est en ligne",
                PLAIN,
            ),
            (
                "googleplay-noreply@google.example",
                "[Notification importante] Changements concernant les taxes",
                PLAIN,
            ),
            ("newsletter@lefil.example", "Le Fil Tech — n°40", PLAIN),
            (
                "noreply@opna.example",
                "Résumé de Toulouse - Tableau de Bord",
                LIST,
            ),
            (
                "no-reply@status.example",
                "Your personal access tokens will expire in 60 days or less",
                AUTOMATED,
            ),
            (
                "community@virustotal.example",
                "Keep up to date with VirusTotal features",
                LIST,
            ),
            (
                "notifications@github.com",
                "[owner/app] fix(calendar): verify the token (#88)",
                PLAIN,
            ),
            (
                "notifications@gitlab.example",
                "Re: Password field loses focus",
                AUTOMATED,
            ),
            (
                "no-reply@kaggle.example",
                "Competition Launch: Verifiable Quantum Circuits",
                LIST,
            ),
            (
                "no-reply@cloud.example",
                "Le résultat de la vérification d'intégrité du code a changé",
                AUTOMATED,
            ),
        ],
    );
}

#[test]
fn signals_survive_their_storage() {
    for bits in 0..16 {
        assert_eq!(SendingSignals::from_bits(bits).bits(), bits);
    }
    assert_eq!(SendingSignals::from_bits(CAMPAIGN.bits()), CAMPAIGN);
}

#[test]
fn codes_round_trip() {
    for category in [
        Category::Primary,
        Category::Transactions,
        Category::Updates,
        Category::Promotions,
    ] {
        assert_eq!(Category::from_code(category.code()), category);
    }
}
