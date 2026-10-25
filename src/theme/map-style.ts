import type { MapStyleElement } from 'react-native-maps';

/**
 * BOA cockpit map: near-black land, graphite roads, motorways traced in gold,
 * and no shops, restaurants, transit or business clutter.
 */
export const COCKPIT_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0C0C0D' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8D8576' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050505' }, { weight: 3 }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#C9BFA9' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0E0E0F' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#121213' }] },

  // Points of interest and public transport are hidden: this is a driving cockpit.
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#101210' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#232325' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0A0A0A' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9A9284' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#1A1A1C' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#2B2B2E' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#4A3B1C' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#CDA960' }, { weight: 0.6 }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#E8CF94' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.fill', stylers: [{ color: '#5C4920' }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050607' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3C3A36' }] },
];
