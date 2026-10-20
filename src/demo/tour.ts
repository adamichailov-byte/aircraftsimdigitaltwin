export const tourStops = [
  { zoneId: 'receiving', title: 'Supply', description: 'Sections and supplier kits arrive at receiving before they are staged for assembly.' },
  { zoneId: 'bay-1', title: 'Fuselage join', description: 'The first occupied bay joins the major fuselage sections.' },
  { zoneId: 'bay-3', title: 'Systems', description: 'Avionics and aircraft systems are installed and prepared for test.' },
  { zoneId: 'bay-5', title: 'Cabin', description: 'Interior kits and cabin fittings go in after the structural work.' },
  { zoneId: 'bay-6', title: 'Pre-paint release', description: 'Ground systems checks finish before the unpainted aircraft exits through the east hangar door.' },
  { zoneId: 'paint', title: 'Paint', description: 'The aircraft enters the enclosed finish area, then reverses out.' },
  { zoneId: 'flightline', title: 'Acceptance', description: 'Ground acceptance precedes an offsite flight; the return stand is retained for post-flight clearance.' },
  { zoneId: 'delivery', title: 'Yard', description: 'Completed aircraft move through apron checks to one of two delivery stands.' },
] as const;

export function tourCommandForKey(key: string): 'next' | 'back' | 'exit' | null {
  if (key === 'ArrowRight' || key.toLowerCase() === 'n') return 'next';
  if (key === 'ArrowLeft' || key.toLowerCase() === 'b') return 'back';
  if (key === 'Escape' || key.toLowerCase() === 'x') return 'exit';
  return null;
}
