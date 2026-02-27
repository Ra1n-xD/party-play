import { useEffect } from "react";

interface PhaseAnnouncementProps {
  title: string;
  subtitle?: string;
  description?: string;
  onDismiss: () => void;
}

export function PhaseAnnouncement({ title, subtitle, description, onDismiss }: PhaseAnnouncementProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="phase-announcement-overlay">
      <div className="phase-announcement-content">
        <div className="phase-announcement-title">{title}</div>
        {subtitle && <div className="phase-announcement-subtitle">{subtitle}</div>}
        {description && <div className="phase-announcement-description">{description}</div>}
      </div>
    </div>
  );
}
