import { createFileRoute, redirect } from "@tanstack/react-router";

// Crisis help now lives inside the chat (human support view + in-app call).
// Old links to /crisis open that view; signed-out visitors go via sign-in.
export const Route = createFileRoute("/crisis")({
  beforeLoad: () => {
    throw redirect({ to: "/chat", search: { support: true } });
  },
});
