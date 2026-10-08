import type { DocPage } from "@/lib/docs";

export const account: DocPage[] = [
  {
    slug: "account-and-billing",
    title: "Account and billing",
    description: "Signing in, plans, the beta, payments, invoices and cancelling.",
    body: `
## Signing in

You can sign in to StudPilot with:

- **Email and password.** Sign-up asks for your date of birth to check that you are 13 or older. It is checked in your browser and never sent or stored; StudPilot keeps only a note that you passed.
- **Roblox,** with "Continue with Roblox". This makes its own StudPilot account; it does not attach to an email account you already have. StudPilot asks Roblox only for your id and username and never sees your Roblox password.
- **Google or Discord,** where the sign-in page shows them.

StudPilot is for people aged 13 and older.

## Plans

| Plan | Price | Credits |
| --- | --- | --- |
| Free | $0 | 5 a day, up to 30 a month |
| Pro | $9.99 a month | 100 a month, up to 20 a day |
| Max | $24.99 a month | 300 a month, up to 30 a day |
| Top-up | $4.99 once | 50 credits that do not expire |

Every plan gets the same agent and the same features. Paying changes your allowance, not your place in a queue. See [Credits and limits](/docs/credits-and-limits) for how allowances work.

> [!NOTE] Checkout is closed during the beta
> Nobody can subscribe or buy credits yet. The paid plans are listed so you can see where pricing is going. Everything below describes how billing works once checkout opens.

## Payments

Payments are handled by Stripe. Your card stays with Stripe; StudPilot never sees or stores it. Everything to do with money, cards, invoices and cancelling, lives in Stripe's billing portal, reached from your account's usage page in the app once you are on a paid plan.

## A payment failed

Your plan keeps working while Stripe retries the card over the following days. Update the card in the billing portal and it applies immediately. If the retries run out, the account moves to Free. Your projects, checkpoints and chats are untouched; nothing is deleted for non-payment.

## Invoices

Every invoice is in the billing portal, with a PDF, including ones from a subscription that has ended. To put a company name, address or VAT number on them, set it in the portal before the next invoice.

## Cancelling

Cancel in the billing portal. You keep the plan until the end of the period you already paid for, then the account moves to Free with everything still in it.

## Changing plan

Move between paid plans in the billing portal, not with a new checkout. A second checkout would add a second subscription rather than replace the first.

## Questions

Email [support@studpilot.app](mailto:support@studpilot.app) with the email address on the account and roughly when the payment was. Never send a card number.
`,
  },
  {
    slug: "privacy-and-data",
    title: "Privacy and data",
    description: "What StudPilot stores, where it lives, what the agent sees, and how to export or delete it.",
    body: `
This page is the practical map of your data. The legally binding version is the [Privacy Policy](/privacy).

> [!NOTE] The core rules
> Your projects stay yours. Data that comes from Roblox is never used for AI training. StudPilot does not sell data, run ads or track you across sites.

## What StudPilot stores

- **Your sign-in.** Your email and a password hash, or your Roblox id and username if you sign in with Roblox.
- **Projects.** Names, and the name and id of the place you connect.
- **Chats.** Your conversations with the agent and the record of what it did in your place. This is the project's memory; deleting the project deletes it.
- **Checkpoints.** Compressed snapshots of the parts of your place each run changed, so undo works. The newest 25 per project are kept.
- **Usage.** When you used credits and how many, so allowances reset fairly.
- **A request log.** Which route was called, when, how long it took and whether it failed. It can carry your account id for 30 days.
- **Billing state,** if you subscribe: the subscription and invoice references Stripe sends back.

## What the agent sees

When you send a request, the model receives your message and the context it needs from your project and place: relevant parts of the instance tree, properties, scripts and Output messages. The model runs on Cloudflare Workers AI through Cloudflare AI Gateway, which keeps a log of each call, prompt and reply included, for 30 days and then deletes it.

When the agent searches the Roblox documentation, the search words are sent to the search service it uses.

## What the plugin sees

The plugin acts only on the place you connected, and only sends what a request needs. It cannot read files on your computer, other places, or your Roblox account. The full boundary is in [What the plugin can change](/docs/plugin-permissions).

## Where it lives

- **Cloudflare** runs StudPilot and stores project data (chats and checkpoints), isolated per project, and runs the AI models.
- **Supabase** runs sign-in and the list of your projects, protected so only your own requests can read what is yours.
- **Stripe** handles payments.
- **Sentry** receives error reports: the kind of error, a scrubbed message and where it happened, never a request body or cookies.

## Export your data

In the app, open **Settings → Privacy → Download my data** to get your data in one file: your account records, every project's conversation, checkpoint records and credit usage. The file lists at the top anything it leaves out and why.

## Delete your data

- **A project:** delete it from the project's menu. Its conversation and checkpoints go with it. Your place in Studio is not touched.
- **Your account:** **Settings → Danger zone → Delete account**. It erases every store StudPilot can reach and gives you a receipt naming anything that has to outlive it, such as accounting records kept under an id that no longer belongs to anyone. Backups expire within 30 days.

For anything the app cannot do for you, email [support@studpilot.app](mailto:support@studpilot.app).

## Age

StudPilot is for people aged 13 and older. If you believe an account belongs to someone under 13, tell us and we will delete it.
`,
  },
];
