import { createTestnetPaymentGate } from "../src/payment/x402-gate";

const gate = createTestnetPaymentGate();
const decision = await gate.authorizeAndSettle({
  method: "POST",
  url: "https://business.newbies.cool/api/v1/business/lookup",
  headers: new Headers({ accept: "application/json" }),
});
if (decision.ok || decision.response.status !== 402 || !decision.response.headers.has("payment-required")) {
  throw new Error("Expected an x402 v2 402 response with PAYMENT-REQUIRED");
}
console.log("x402 testnet challenge PASS: 402 with PAYMENT-REQUIRED");
