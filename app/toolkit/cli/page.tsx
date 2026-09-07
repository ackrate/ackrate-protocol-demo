import { redirect } from "next/navigation";

/** Preserve old bookmarks without presenting a second, outdated CLI runner. */
export default function ToolkitCliPage() {
  redirect("/cli");
}
