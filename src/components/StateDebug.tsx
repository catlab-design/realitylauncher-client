
import { useEffect, useRef } from 'react';

export function StateDebug({ 
  selectedInstance, 
  activeTab 
}: { 
  selectedInstance: any, 
  activeTab: string 
}) {
  const prevInstance = useRef(selectedInstance);
  const prevTab = useRef(activeTab);

  useEffect(() => {
    if (prevInstance.current !== selectedInstance) {
      console.log(`[StateDebug] selectedInstance changed from ${prevInstance.current?.name} to ${selectedInstance?.name}`);
      console.trace("[StateDebug] Stack trace for selectedInstance change:");
      prevInstance.current = selectedInstance;
    }
  }, [selectedInstance]);

  useEffect(() => {
    if (prevTab.current !== activeTab) {
      console.log(`[StateDebug] activeTab changed from ${prevTab.current} to ${activeTab}`);
      prevTab.current = activeTab;
    }
  }, [activeTab]);

  return null;
}
