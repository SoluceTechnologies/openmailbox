# Privacy Policy — Open Mailbox

**Last updated: November 10, 2026**

---

## 1. Overview

Open Mailbox is an open source mail client for iOS and Android. It connects directly to the mail
servers of your accounts: there is no Open Mailbox server in between, and the developers never
receive your mail, credentials or usage data.

---

## 2. Data Stored on Your Device

| Data | Handling |
|------|----------|
| Account settings (address, server names, ports) | Stored locally on the device |
| Passwords | Stored in the device's secure storage (Keychain on iOS, Keystore on Android) |
| Messages, folders and attachments | Cached locally so they can be read and searched offline |
| App preferences | Stored locally on the device |

Removing an account deletes its data from the device. Uninstalling the app deletes all of it.
On Android, the app's data is excluded from system backups.

---

## 3. Data Not Collected

The application does **not** collect or transmit:

- Analytics or telemetry
- Crash reports
- Location data
- Advertising identifiers
- Browsing or behavioral data

It includes no advertising, analytics or tracking SDK.

---

## 4. Network Connections

The app only connects to the following, and only for the stated purpose:

| Destination | When | What it learns |
|-------------|------|----------------|
| Your IMAP and SMTP servers | To read, sync and send mail | What any mail client sends to your provider |
| `autoconfig.<your domain>` and `autoconfig.thunderbird.net` (Mozilla) | Once, when you add an account from a provider the app does not know | Your domain; your own domain's server also receives your address |
| Gravatar (Automattic) and the website of a sender's company | To show contact pictures, at most once a month per address; can be turned off in Settings | That someone looks up this address (Gravatar receives a hash of it) |
| Cloudflare's DNS resolver (`cloudflare-dns.com`) and the server a company names for its logo | With contact pictures, to find the logo a company publishes for its mail (BIMI), at most once a month per address | The company's domain, never your address |
| Servers hosting remote images in a message | Only when you choose to load them; they are blocked by default | That the message was opened, and your IP address |
| The unsubscribe address given by a mailing list | Only when you tap Unsubscribe | Your request to leave the list |

Links you tap open in your browser and are subject to the policy of the site you visit.

---

## 5. Permissions

| Permission | Reason |
|------------|--------|
| Network access | Connect to your mail servers |
| Contacts (read only) | Suggest addresses while you write; contacts stay on the device |
| Photos | Attach the photos and videos you pick |
| Notifications | Tell you about new mail, checked in the background on the device |

Each permission is optional; the related feature is disabled when it is refused.

---

## 6. Children

The application is not directed at children under 13 and does not knowingly collect data from them.

---

## 7. Changes to This Policy

Changes are published in this file with an updated date.

---

## 8. Contact

For any privacy-related question, open an issue on the
[GitHub repository](https://github.com/SoluceTechnologies/openmailbox/issues).
