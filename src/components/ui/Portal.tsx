import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: React.ReactNode;
  targetId?: string;
}

/**
 * Portal component to render children outside their parent DOM hierarchy.
 * Useful for modals, tooltips, and overlays to escape overflow:hidden or transform constraints.
 */
export const Portal: React.FC<PortalProps> = ({ children, targetId = "portal-root" }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Ensure the target element exists
    if (!document.getElementById(targetId)) {
      const portalRoot = document.createElement("div");
      portalRoot.id = targetId;
      document.body.appendChild(portalRoot);
    }
    
    return () => setMounted(false);
  }, [targetId]);

  if (!mounted) return null;

  const target = document.getElementById(targetId);
  return target ? createPortal(children, target) : null;
};

export default Portal;
