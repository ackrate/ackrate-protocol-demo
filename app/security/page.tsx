import { permanentRedirect } from "next/navigation";

export default function SecurityPage() {
  permanentRedirect("https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-security-verification.md");
}
