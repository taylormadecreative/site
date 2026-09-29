// Nelson's Inbox reply as email-safe HTML: escaped, line breaks kept.
export function replyBodyHtml(body: string): string {
  return String(body ?? "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
    .replace(/\r?\n/g, "<br>");
}
