import type { MapStyleElement } from 'react-native-maps';

/**
 * BOA cockpit map, tuned for reading at a glance (and through glasses):
 * near-black land, a clear road hierarchy (motorways bold gold, A-roads bright,
 * local streets subtle), and high-contrast
 * street names with a heavy dark halo. Shops, transit and business clutter are hidden.
 * Buildings (3D when the camera tilts), parks, woodland and water keep a faint
 * tint of their own, so the city has depth without competing with the route.
 *
 * Google map styles cannot set a font size, so legibility comes from contrast,
 * the halo weight and thicker roads; the driving zoom (17 by default, kept at
 * whatever the driver pinches to) sets the text size on screen.
 */
export const COCKPIT_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0C0C0D' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#B5AD9C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050505' }, { weight: 4 }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#E6DCC4' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0E0E0F' }] },
  // Woodland and fields: the closest the Google SDK gets to drawing trees.
  { featureType: 'landscape.natural.landcover', elementType: 'geometry', stylers: [{ color: '#0D140F' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#111311' }] },
  // Building footprints and their 3D extrusions: warm graphite, a step above the land.
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#1C1A18' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#2C2822' }] },

  // Points of interest and public transport are hidden: this is a driving cockpit.
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#0F1A12' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Roads, ranked so the hierarchy reads at a glance: motorways bold and gold,
  // major roads bright, local streets subtle so they never compete with the route.
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#34343A' }, { weight: 1.8 }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#050505' }, { weight: 1 }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#EDE6D6' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#050505' }, { weight: 5 }] },
  // Local streets: low contrast, thin, quieter labels.
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#222226' }, { weight: 1 }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#8F897C' }] },
  // A and B roads: clear platinum, a step up from local.
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#55555C' }, { weight: 2.6 }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#F5F0E6' }] },
  // Dual carriageways and trunk roads: warm bronze.
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#7A6128' }, { weight: 3.4 }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2A220F' }, { weight: 1.2 }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#FFF1C9' }] },
  // Motorways: the boldest line on the map, bright gold with a glowing edge.
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#C9A24A' }, { weight: 5 }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.stroke', stylers: [{ color: '#F3DDA4' }, { weight: 1.6 }] },
  { featureType: 'road.highway.controlled_access', elementType: 'labels.text.fill', stylers: [{ color: '#FFF6DC' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'labels.text.stroke', stylers: [{ color: '#1A1407' }, { weight: 6 }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#061019' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5A574F' }] },
];
