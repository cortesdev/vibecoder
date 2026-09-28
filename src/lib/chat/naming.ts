// A thread name from what the user actually typed. Shared by the chat-first
// home and the older project launcher so a thread is named the same way
// wherever it is opened.
export function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  return (words.length > 42 ? `${words.slice(0, 42)}…` : words) || "New chat";
}
