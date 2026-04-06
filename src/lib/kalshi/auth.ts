import crypto from "crypto";

export interface KalshiAuthHeaders {
  "Content-Type": string;
  "KALSHI-ACCESS-KEY": string;
  "KALSHI-ACCESS-SIGNATURE": string;
  "KALSHI-ACCESS-TIMESTAMP": string;
}

export function signRequest(
  privateKeyPem: string,
  apiKeyId: string,
  method: string,
  path: string
): KalshiAuthHeaders {
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];
  const message = timestamp + method.toUpperCase() + pathWithoutQuery;

  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem",
    type: "pkcs8",
  });

  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
  });

  return {
    "Content-Type": "application/json",
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature.toString("base64"),
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
  };
}
