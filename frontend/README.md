This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## WhatsApp Entry

Set `NEXT_PUBLIC_WHATSAPP_NUMBER` in `frontend/.env.local` to the bot's full
international number, including country code (no local leading zero). This is
public configuration, not a secret. Spaces, parentheses, hyphens and a leading
`+` are accepted. Restart the dev server after changing it; production deployments
must rebuild because Next.js embeds `NEXT_PUBLIC_*` values at build time.

The supplied `public/images/whatsapp-qrcode.png` was decoded and points to
`https://wa.me/923555831500?text=Hello%21+I+am+interested+in+learning+more+about+your+business.`
Only use `NEXT_PUBLIC_WHATSAPP_NUMBER=923555831500` if this is your intended bot.
The QR's existing greeting is retained; the direct chat link opens the same number
without a prefilled message. Bot availability/ownership must be verified by the operator.

On mobile the hero opens chat; on desktop it opens an accessible QR dialog with
an open-chat fallback. If a different valid number is configured, the dialog shows
only the chat fallback, never the stale QR. To enable a replacement QR, replace
the image and update `WHATSAPP_QR_NUMBER` in `src/lib/whatsapp.ts` after decoding it.
Missing or invalid configuration disables the WhatsApp entry with a visible
message; the web "Get a token" flow remains available.

## Select Labels

The shared `Select` wrapper supplies Base UI's root `items` mapping from inline
`SelectItem` labels (falling back to their children), including arrays, fragments,
and groups. This keeps selected IDs as submitted values while displaying names,
even before the popup mounts. Explicit `items` mappings take precedence; pass one
when options are encapsulated inside a separate component.

Run the frontend regression tests with `npx --yes --package=tsx tsx --test tests/*.test.tsx`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Docker Configuration

Local Compose passes root `.env` variable `WHATSAPP_BOT_NUMBER` to the frontend
as the `NEXT_PUBLIC_WHATSAPP_NUMBER` build argument. Rebuild the frontend after
changing it. Direct Docker/CI builds must supply that build argument explicitly;
Vercel and native development use `NEXT_PUBLIC_WHATSAPP_NUMBER` instead.
