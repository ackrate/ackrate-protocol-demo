/** Existing ACKRATE mark geometry from mks044/ackrate-web, src/benchmark/Icons.tsx. */
export default function AckrateArchMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="ackrate-arch-mark">
    <path d="M9 32V16a11 11 0 0 1 22 0v16M9 21h22M20 21v11" stroke="currentColor" strokeWidth="2" />
  </svg>;
}
