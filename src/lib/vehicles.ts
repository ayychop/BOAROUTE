export interface Vehicle {
  id: '25' | '26';
  plate: string;
  role: string;
  /** Saved to profiles.vehicle_model */
  model: string;
  year: number;
  /** Bundled asset id from require() */
  image: number;
  credit: { author: string; license: string; source: string; changes: string };
  specs: { label: string; value: string }[];
}

export const VEHICLES: Vehicle[] = [
  {
    id: '25',
    plate: '25 Plate (Admin)',
    role: 'Admin',
    model: 'BMW X1 M Sport Hybrid (25 Plate)',
    year: 2025,
    image: require('../../assets/images/bmw-x1-25-plate.jpg'),
    credit: {
      author: 'Chanokchon',
      license: 'CC BY-SA 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:2023_BMW_X1_xDrive_30e_M_Sport.jpg',
      changes: 'Digitally recoloured from white to black.',
    },
    specs: [
      { label: 'Drive', value: 'xDrive25e' },
      { label: 'Power', value: 'Plug-in hybrid' },
      { label: 'Trim', value: 'M Sport' },
    ],
  },
  {
    id: '26',
    plate: '26 Plate (Merchandiser)',
    role: 'Merchandiser',
    model: 'BMW X1 M Sport Hybrid (26 Plate)',
    year: 2026,
    image: require('../../assets/images/bmw-x1-26-plate.jpg'),
    credit: {
      author: 'M 93',
      license: 'CC BY-SA 3.0 DE',
      source: 'https://commons.wikimedia.org/wiki/File:BMW_X1_xDrive30e_M_Sportpaket_Pro_(U11)_%E2%80%93_f_05062025.jpg',
      changes: 'Digitally recoloured from white to black; number plate removed.',
    },
    specs: [
      { label: 'Drive', value: 'xDrive25e' },
      { label: 'Power', value: 'Plug-in hybrid' },
      { label: 'Trim', value: 'M Sport' },
    ],
  },
];

export function vehicleFor(model: string | null | undefined): Vehicle | null {
  if (!model) return null;
  return VEHICLES.find((v) => v.model === model) ?? null;
}

/**
 * The car to show in a hero: their saved model, else the one for their role
 * (25 plate for admins, 26 for merchandisers). A profile with no model, or one
 * saved under an old name, still gets the photo and the full-size plate.
 */
export function heroVehicle(model: string | null | undefined, isAdmin: boolean): Vehicle {
  return vehicleFor(model) ?? (isAdmin ? VEHICLES[0] : VEHICLES[1]);
}
