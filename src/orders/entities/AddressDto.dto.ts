export class AddressDto {
  userLocationId: number;
  userId: number | null;

  title?: string;             // Location (label)
  address?: string;           // Address details

  streetNameOrNumber?: string;
  buildingNameOrNumber?: string; // Building number
  floorNumber?: string;
  apartment?: string;
  nearestLandmark?: string;      // Special signs

  lat?: number | null;
  lng?: number | null;

  countryId?: number | null;
  countryName?: string | null;

  governorateId?: number | null;   // = State
  governorateName?: string | null;

  districtId?: number | null;
  districtName?: string | null;

  isHome: boolean;
  isWork: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
