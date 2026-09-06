"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Braces, Check, ListFilter, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { MarketplaceInputField, MarketplaceService } from "@/lib/wallet/marketplace-catalog";

export type ServiceInputValues = Record<string, string>;

const SEARCH_EXAMPLES = [
  "What is Stellar?",
  "How are AI agents using stablecoin payments?",
  "What changed in the x402 ecosystem this year?",
];

export function initialServiceInputValues(service: MarketplaceService): ServiceInputValues {
  return Object.fromEntries(service.inputs.map((field) => {
    const example = field.example;
    const value = Array.isArray(example)
      ? example.join("\n")
      : example === null || example === undefined || typeof example === "object"
        ? ""
        : String(example);
    return [field.name, field.name === "q" && service.id === "search" ? "" : value];
  }));
}

export function submittedServiceInput(field: MarketplaceInputField, value: string): string | number | boolean | string[] | Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed && !field.required) return undefined;
  if (field.type === "number" || field.type === "integer") return Number(trimmed);
  if (field.type === "boolean") return trimmed === "true";
  if (field.type === "array") return trimmed.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  if (field.type === "object") return JSON.parse(trimmed);
  return trimmed;
}

export function serializedServiceInputs(service: MarketplaceService, values: ServiceInputValues): Record<string, unknown> {
  const problem = serviceInputProblem(service, values);
  if (problem) throw new Error(problem);
  return Object.fromEntries(service.inputs.flatMap((field) => {
    const value = submittedServiceInput(field, values[field.name] ?? "");
    return value === undefined ? [] : [[field.name, value]];
  }));
}

export function serviceInputProblem(service: MarketplaceService, values: ServiceInputValues): string | null {
  if (service.inputs.length === 0) return "Agent402 did not publish an input schema for this listing.";
  for (const field of service.inputs) {
    const value = values[field.name]?.trim() ?? "";
    if (field.required && !value) return `Enter ${field.name} to continue.`;
    if ((field.type === "number" || field.type === "integer") && value && !Number.isFinite(Number(value))) {
      return `${field.name} must be a number.`;
    }
    if (field.type === "integer" && value && !Number.isSafeInteger(Number(value))) return `${field.name} must be a whole number.`;
    if (field.options.length > 0 && value && !field.options.includes(value)) return `Choose one of the published options for ${field.name}.`;
    if (field.type === "boolean" && value && value !== "true" && value !== "false") return `Choose Yes or No for ${field.name}.`;
    if (field.type === "string" && /^(?:url|uri)$/i.test(field.name) && value) {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return `${field.name} must be a public HTTP or HTTPS URL without credentials.`;
      } catch { return `Enter a complete HTTP or HTTPS URL for ${field.name}.`; }
    }
    if (service.id === "search" && field.name === "q" && (value.length < 3 || value.length > 400)) return "Enter a search question between 3 and 400 characters.";
    if (field.type === "object" && value) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return `${field.name} must be a JSON object.`;
      } catch {
        return `${field.name} must be valid JSON.`;
      }
    }
  }
  return null;
}

function fieldLabel(field: MarketplaceInputField): string {
  return field.name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function largeField(field: MarketplaceInputField): boolean {
  return field.type === "array"
    || field.type === "object"
    || /text|markdown|content|prompt|message|query|question|spec/i.test(`${field.name} ${field.description}`);
}

function FieldControl({
  field,
  value,
  disabled,
  onChange,
  searchQuery = false,
}: {
  field: MarketplaceInputField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  searchQuery?: boolean;
}) {
  const label = searchQuery ? "What are you searching for?" : fieldLabel(field);
  const placeholder = searchQuery ? SEARCH_EXAMPLES[0] : field.example === null
    ? field.description
    : Array.isArray(field.example)
      ? field.example.join("\n")
      : String(field.example);

  if (field.options.length > 0) {
    return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      {!field.required && <option value="">Default</option>}
      {field.options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>;
  }
  if (field.type === "boolean") {
    return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      {!field.required && <option value="">Default</option>}
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>;
  }
  if (searchQuery || largeField(field)) {
    return <textarea
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={field.name === "q" ? 4 : 6}
      maxLength={field.name === "q" ? 400 : 100_000}
      disabled={disabled}
    />;
  }
  const urlLike = /url|uri/i.test(`${field.name} ${field.description}`);
  return <input
    aria-label={label}
    type={field.type === "number" || field.type === "integer" ? "number" : urlLike ? "url" : "text"}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    disabled={disabled}
  />;
}

export function ServiceConfigurator({
  service,
  values,
  executable,
  onChange,
  onBack,
  onContinue,
  busy = false,
}: {
  service: MarketplaceService;
  values: ServiceInputValues;
  executable: boolean;
  onChange: (values: ServiceInputValues) => void;
  onBack: () => void;
  onContinue: () => void;
  busy?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const problem = serviceInputProblem(service, values);
  const requiredFields = service.inputs.filter((field) => field.required);
  const optionalFields = service.inputs.filter((field) => !field.required);

  const renderField = (field: MarketplaceInputField, index: number) => {
    const searchQuery = service.id === "search" && field.name === "q";
    return <motion.label
      className={`schema-field ${searchQuery || largeField(field) ? "schema-field-large" : ""}`}
      key={field.name}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.045, duration: 0.22 }}
    >
      <span><b>{searchQuery ? "What are you searching for?" : fieldLabel(field)}</b>{field.required ? <em>Required</em> : <em>Optional</em>}</span>
      <FieldControl
        field={field}
        value={values[field.name] ?? ""}
        disabled={busy}
        searchQuery={searchQuery}
        onChange={(value) => onChange({ ...values, [field.name]: value })}
      />
      <small>{field.description}</small>
    </motion.label>;
  };

  return <div className="service-configurator">
    <div className="config-source-bar">
      <span><Braces size={14} /></span>
      <div><small>{service.schemaSource === "agent402-find" ? "AGENT402 API SCHEMA" : "AGENT402 DOCUMENTED INPUTS"}</small><strong>{service.name}</strong></div>
      <code>{service.method} {service.path}</code>
      <b>{service.price} USDC</b>
    </div>

    {service.inputs.length > 0 ? <div className="schema-field-stack">
      {requiredFields.map(renderField)}
      {optionalFields.length > 0 && <details className="service-parameters">
        <summary>Advanced options <small>{optionalFields.length} optional {optionalFields.length === 1 ? "input" : "inputs"}</small></summary>
        <div className="schema-field-stack">{optionalFields.map(renderField)}</div>
      </details>}
    </div> : <div className="schema-empty"><TriangleAlert size={17} /><div><strong>No machine-readable fields returned</strong><p>Open the listing documentation before using this service.</p></div></div>}

    {service.id === "search" && <div className="config-examples">
      <span>TRY A PROMPT</span>
      {SEARCH_EXAMPLES.map((example) => <button type="button" disabled={busy} key={example} onClick={() => onChange({ ...values, q: example })}>{example}</button>)}
    </div>}

    <div className={`config-readiness ${executable ? "ready" : "inspect-only"}`}>
      <span>{executable ? <Check size={14} /> : <ListFilter size={14} />}</span>
      <div>
        <strong>{executable ? "Ready for the protected payment flow" : "Schema preview"}</strong>
        <p>{executable
          ? `These exact values will be bound to the ${service.price} USDC purchase request.`
          : "This listing is live, but it is not yet in the reviewed payment allowlist."}</p>
      </div>
    </div>

    {problem && <div className="config-problem"><TriangleAlert size={14} />{problem}</div>}

    <div className="config-actions">
      <button type="button" onClick={onBack} disabled={busy}><ArrowLeft size={14} /> Marketplace</button>
      <motion.button
        className="flow-primary"
        type="button"
        onClick={onContinue}
        disabled={busy || !executable || Boolean(problem)}
        whileHover={reduceMotion || !executable || Boolean(problem) ? undefined : { y: -1 }}
        whileTap={reduceMotion || !executable || Boolean(problem) ? undefined : { scale: 0.985 }}
      ><SlidersHorizontal size={15} /> {busy ? "Checking price and seller…" : "Use these inputs"} <ArrowRight size={15} /></motion.button>
    </div>
  </div>;
}
