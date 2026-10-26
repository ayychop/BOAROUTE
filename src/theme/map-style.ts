import type { MapStyleElement } from 'react-native-maps';

/**
 * BOA cockpit map, tuned for reading at a glance (and through glasses):
 * near-black land, thick bright roads, motorways traced in gold, and high-contrast
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

  // Roads: wider and brighter than stock, so the shape of a junction reads instantly.
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#3A3A3E' }, { weight: 2.2 }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#050505' }, { weight: 1.2 }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#EDE6D6' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#050505' }, { weight: 5 }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#2E2E32' }, { weight: 1.8 }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#D9D1BF' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#4A4A50' }, { weight: 2.6 }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#F5F0E6' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#6B5524' }, { weight: 3.2 }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E8CF94' }, { weight: 1 }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#FFF1C9' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#8A6C2C' }, { weight: 3.6 }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#061019' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5A574F' }] },
];
