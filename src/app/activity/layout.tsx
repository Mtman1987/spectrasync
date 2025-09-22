
import DiscordActivity from "./DiscordActivity";

export default function ActivityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DiscordActivity>{children}</DiscordActivity>;
}
