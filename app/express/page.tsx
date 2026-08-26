"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "lucide-react";
import { connectFreighter } from "@/lib/wallet/freighter";

const MAINNET_REGISTRY = "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS";
const MAINNET_PAYMENT_KEY = "ackrate:mainnet:last-payment";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const MAINNET_RECEIPTS = [
  { label: "Payment 1", hash: "934239bcace9393e2ed0a39f114bf1d45c70e434ab4963a04ee17a132ea3bf8a" },
  { label: "Payment 2", hash: "dc4ba3ccfe04ee6daabf70e0253226daae4e73ee686db965fe00634b4bdac48b" },
  { label: "Payment 3", hash: "ba282c06511815319fb204d5e49bbed1ce2e062791032935dbb1031b1c03e90e" },
] as const;

type MainnetPayment = {
  txHash: string;
  amount: string;
  asset: string;
  recordedAt: string;
};

type WalletBalances = {
  address: string;
  xlm: string;
  usdc: string;
};

function readMainnetPayment(): MainnetPayment | null {
  try {
    const value = JSON.parse(localStorage.getItem(MAINNET_PAYMENT_KEY) ?? "null") as Partial<MainnetPayment> | null;
    if (!value || !/^[0-9a-f]{64}$/.test(value.txHash ?? "")) return null;
    if (typeof value.amount !== "string" || value.asset !== "USDC" || typeof value.recordedAt !== "string") return null;
    return value as MainnetPayment;
  } catch {
    return null;
  }
}

function short(value: string, size = 7) {
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

const steps = [
  {
    number: "01",
    icon: WalletCards,
    title: "Set the mandate",
    description: "Approve the merchant, budget, and expiry in Freighter. Your signing key stays in your wallet.",
  },
  {
    number: "02",
    icon: Bot,
    title: "The agent requests a resource",
    description: "The consumer calls the protected Express endpoint and receives a standard HTTP 402 challenge.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "The contract enforces the payment",
    description: "MandateRegistry checks scope and remaining authority before settling $0.01 in Circle USDC.",
  },
  {
    number: "04",
    icon: Server,
    title: "The API returns the result",
    description: "The fulfillment service verifies settlement, returns HTTP 200, and records the transaction as evidence.",
  },
];

const controls = [
  ["Wallet custody", "Funds remain under the user’s Freighter account."],
  ["Contract authority", "The agent can spend only within the signed mandate."],
  ["Merchant scope", "Payment cannot be redirected to another recipient."],
  ["Auditable settlement", "Each completed purchase links to its Mainnet transaction."],
];

export default function ExpressPage() {
  const [mainnetPayment, setMainnetPayment] = useState<MainnetPayment | null>(null);
  const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");

  const refreshBalances = useCallback(async (address: string) => {
    const response = await fetch(`/api/wallet/balances?address=${encodeURIComponent(address)}`, { cache: "no-store" });
    const result = await response.json() as { ok?: boolean; balances?: WalletBalances; error?: string };
    if (!response.ok || !result.ok || !result.balances) {
      throw new Error(result.error ?? "Wallet balances could not be loaded");
    }
    setWalletBalances(result.balances);
  }, []);

  const connectWallet = useCallback(async () => {
    setWalletBusy(true);
    setWalletError("");
    try {
      const address = await connectFreighter(MAINNET_PASSPHRASE);
      await refreshBalances(address);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Freighter could not be connected");
    } finally {
      setWalletBusy(false);
    }
  }, [refreshBalances]);

  useEffect(() => {
    const refresh = () => {
      setMainnetPayment(readMainnetPayment());
      if (walletBalances?.address) void refreshBalances(walletBalances.address).catch(() => undefined);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("ackrate-mainnet-payment", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ackrate-mainnet-payment", refresh);
    };
  }, [refreshBalances, walletBalances?.address]);

  return (
    <main className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 py-10 sm:px-6 sm:py-14">
      <div className="glow" aria-hidden />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-[#06100d]/95 shadow-[0_28px_100px_-38px_rgba(16,185,129,0.55)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(52,211,153,0.13),transparent_34%)]" aria-hidden />
        <div className="relative grid gap-10 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:px-12 lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              Live on Stellar Mainnet · Circle USDC
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-[-0.045em] text-emerald-50 sm:text-6xl lg:text-7xl">
              Agent payments with limits that hold.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-emerald-100/65 sm:text-lg">
              Give an agent permission to buy what it needs—not access to your wallet. ACKRATE binds every payment to a wallet-approved budget, merchant, and expiry, then enforces those terms on Stellar Mainnet before Circle USDC moves.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/wallet"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-black text-[#06241a] shadow-[0_12px_38px_-10px_rgba(52,211,153,0.8)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              >
                <CircleDollarSign className="h-4 w-4" aria-hidden />
                Run the $0.01 USDC payment
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href={`https://stellar.expert/explorer/public/contract/${MAINNET_REGISTRY}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-black/20 px-5 py-3 text-sm font-semibold text-emerald-100/80 transition hover:border-emerald-400/45 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                View Mainnet contract
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-black/30 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/65">Reference payment</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-bold text-emerald-300">MAINNET</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric value="$0.01" label="USDC per request" />
              <Metric value="$0.03" label="Mandate ceiling" />
              <Metric value="3" label="Purchases allowed" />
              <Metric value="4th" label="Rejected on-chain" />
            </div>
            <div className="mt-5 border-t border-white/10 pt-5">
              {mainnetPayment ? (
                <a
                  href={`https://stellar.expert/explorer/public/tx/${mainnetPayment.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-3.5 transition hover:border-emerald-400/50"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-400 text-[#06241a]">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-emerald-100">Payment confirmed</span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-emerald-100/45">{short(mainnetPayment.txHash)}</span>
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                </a>
              ) : (
                <div className="flex items-start gap-3">
                  <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300/70" aria-hidden />
                  <p className="text-xs leading-5 text-emerald-100/50">
                    Complete a payment to place its Stellar Explorer receipt here automatically.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/65">Live settlement proof</span>
                <span className="text-[10px] font-semibold text-emerald-100/40">3 × $0.01 USDC</span>
              </div>
              <div className="mt-3 space-y-2">
                {MAINNET_RECEIPTS.map((receipt) => <ReceiptRow key={receipt.hash} {...receipt} />)}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-emerald-100/35">The fourth request exceeded the $0.03 mandate and was rejected before broadcast.</p>
            </div>
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/65">Your Freighter balance</span>
                {walletBalances && (
                  <button
                    type="button"
                    onClick={() => void connectWallet()}
                    disabled={walletBusy}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-emerald-100/45 transition hover:border-emerald-400/35 hover:text-emerald-200 disabled:opacity-40"
                    aria-label="Refresh wallet balances"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${walletBusy ? "animate-spin" : ""}`} aria-hidden />
                  </button>
                )}
              </div>
              {walletBalances ? (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Balance value={walletBalances.xlm} asset="XLM" />
                    <Balance value={walletBalances.usdc} asset="USDC" />
                  </div>
                  <div className="mt-3 truncate font-mono text-[9px] text-emerald-100/30">{walletBalances.address}</div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectWallet()}
                  disabled={walletBusy}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-2.5 text-xs font-bold text-emerald-200 transition hover:border-emerald-400/45 hover:bg-emerald-400/[0.1] disabled:opacity-50"
                >
                  {walletBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <WalletCards className="h-3.5 w-3.5" aria-hidden />}
                  {walletBusy ? "Reading Mainnet balances…" : "Show my XLM + USDC"}
                </button>
              )}
              {walletError && <p className="mt-2 text-[10px] leading-4 text-amber-200/75">{walletError}</p>}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45 }}
        className="mt-8 overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[#07110e]/85"
      >
        <div className="border-b border-white/10 px-5 py-6 sm:px-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/65">One request, independently verifiable</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">From HTTP 402 to paid delivery</h2>
        </div>
        <ol className="grid lg:grid-cols-4">
          {steps.map(({ number, icon: Icon, title, description }, index) => (
            <li key={number} className={`relative p-5 sm:p-7 ${index ? "border-t border-white/10 lg:border-l lg:border-t-0" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-mono text-[10px] text-emerald-100/25">{number}</span>
              </div>
              <h3 className="mt-5 text-base font-bold text-emerald-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-100/50">{description}</p>
            </li>
          ))}
        </ol>
      </motion.section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.45 }}
          className="rounded-[2rem] border border-emerald-300/15 bg-[#07110e]/85 p-5 sm:p-8"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="mt-5 text-2xl font-black tracking-tight text-emerald-50">The agent never gets your wallet.</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-100/55">
            Freighter handles every user signature. The SDK prepares the request; MandateRegistry decides whether the payment is authorized. Application code cannot raise the ceiling, change the merchant, or extend the deadline.
          </p>
          <div className="mt-6 rounded-xl border border-emerald-400/15 bg-black/25 p-4 font-mono text-[11px] leading-6 text-emerald-100/55">
            <div><span className="text-emerald-300">network</span>  Stellar Mainnet</div>
            <div><span className="text-emerald-300">asset</span>    Circle USDC</div>
            <div><span className="text-emerald-300">contract</span> {short(MAINNET_REGISTRY, 10)}</div>
            <div><span className="text-emerald-300">policy</span>   merchant + amount + expiry</div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45 }}
          className="rounded-[2rem] border border-emerald-300/15 bg-[#07110e]/85 p-5 sm:p-8"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/65">Control surface</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-emerald-50">Designed for accountable autonomy.</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {controls.map(([title, description]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-100">
                  <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                  {title}
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-100/45">{description}</p>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, duration: 0.45 }}
        className="mt-8 grid gap-4 sm:grid-cols-3"
        aria-label="Mainnet developer toolkit"
      >
        <ToolkitCard icon={CircleDollarSign} title="SDK" copy="Typed packages prepare mandates, agent requests, and verified fulfillment." />
        <ToolkitCard icon={Terminal} title="CLI" copy="The research-agent command runs the same Mainnet payment path from a terminal." />
        <ToolkitCard icon={Bot} title="Reference agents" copy="Consumer and fulfillment examples show both sides of the 402 exchange." />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, duration: 0.45 }}
        className="mt-8 flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.09] to-transparent p-6 sm:flex-row sm:items-center sm:p-8"
      >
        <div>
          <h2 className="text-2xl font-black tracking-tight text-emerald-50">See the policy hold under real payment pressure.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/55">
            Authorize three one-cent purchases. The fourth request exceeds the mandate and is rejected by the contract before settlement.
          </p>
        </div>
        <Link
          href="/wallet"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-[#06241a] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          Open Mainnet demo
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </motion.section>
    </main>
  );
}

function ReceiptRow({ label, hash }: { label: string; hash: string }) {
  const [copied, setCopied] = useState(false);
  const copyHash = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-black/20 px-3 py-2.5">
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-emerald-100">{label}</span>
        <code className="block truncate text-[9px] text-emerald-100/35">{short(hash, 6)}</code>
      </span>
      <button
        type="button"
        onClick={() => void copyHash()}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-emerald-100/45 transition hover:border-emerald-400/35 hover:text-emerald-200"
        aria-label={`Copy ${label} transaction hash`}
        title={copied ? "Copied" : "Copy transaction hash"}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <a
        href={`https://stellar.expert/explorer/public/tx/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-emerald-400/20 text-emerald-300 transition hover:border-emerald-400/45 hover:bg-emerald-400/[0.08]"
        aria-label={`Open ${label} in Stellar Explorer`}
        title="Open in Stellar Explorer"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3.5">
      <div className="text-xl font-black tabular-nums text-emerald-200">{value}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-100/35">{label}</div>
    </div>
  );
}

function Balance({ value, asset }: { value: string; asset: "XLM" | "USDC" }) {
  return (
    <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-3.5 py-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-black tabular-nums text-emerald-100">{value}</span>
        <span className="text-[10px] font-bold text-emerald-300/70">{asset}</span>
      </div>
    </div>
  );
}

function ToolkitCard({ icon: Icon, title, copy }: { icon: typeof Bot; title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-emerald-300/15 bg-[#07110e]/85 p-5">
      <Icon className="h-5 w-5 text-emerald-300" aria-hidden />
      <h2 className="mt-4 text-base font-bold text-emerald-100">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-emerald-100/45">{copy}</p>
    </div>
  );
}
