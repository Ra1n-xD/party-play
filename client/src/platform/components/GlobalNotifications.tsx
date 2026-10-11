import { useEffect, useState } from "react";
import { usePlatform } from "../context/PlatformContext";
import { useProfile } from "../context/ProfileContext";
import { NotificationDialog } from "./NotificationDialog";

export function GlobalNotifications() {
  const { error: platformError, clearError: clearPlatformError } = usePlatform();
  const { error: profileError, clearError: clearProfileError } = useProfile();
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const incoming = [platformError, profileError].filter(
      (message): message is string => !!message,
    );
    if (incoming.length === 0) return;
    setMessages((current) => [...new Set([...current, ...incoming])]);
    if (platformError) clearPlatformError();
    if (profileError) clearProfileError();
  }, [platformError, profileError, clearPlatformError, clearProfileError]);

  const message = messages[0];
  if (!message) return null;

  return (
    <NotificationDialog
      key={message}
      message={message}
      kind="error"
      onClose={() => setMessages((current) => current.slice(1))}
    />
  );
}
