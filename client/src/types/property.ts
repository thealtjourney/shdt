export interface Property {
  id: string;
  uprn?: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  epc_rating?: string;
  property_type?: string;
  bedrooms?: number;
  year_built?: number;
  heating_type?: string;
  stock_condition_score?: number;
  last_inspection_date?: string;
}
