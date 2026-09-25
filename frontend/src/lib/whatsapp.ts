// Decoded from public/images/whatsapp-qrcode.png. Update together with the asset.
export const WHATSAPP_QR_NUMBER = "923555831500";

export function whatsappEntry(number: string | undefined) {
  const digits = (number ?? "").trim().replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{6,14}$/.test(digits)) return null;

  return {
    url: `https://wa.me/${digits}`,
    hasMatchingQr: digits === WHATSAPP_QR_NUMBER,
  };
}
