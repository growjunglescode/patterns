/** Country list + cascading cities for onboarding / profile. */

export const COUNTRIES = [
  "Argentina",
  "Australia",
  "Austria",
  "Belgium",
  "Belize",
  "Bolivia",
  "Brazil",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Costa Rica",
  "Cuba",
  "Czech Republic",
  "Denmark",
  "Dominican Republic",
  "Ecuador",
  "El Salvador",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Guatemala",
  "Guyana",
  "Honduras",
  "India",
  "Indonesia",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Kenya",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Norway",
  "Panama",
  "Paraguay",
  "Peru",
  "Poland",
  "Portugal",
  "South Africa",
  "South Korea",
  "Spain",
  "Suriname",
  "Sweden",
  "Switzerland",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Venezuela",
] as const;

export type CountryName = (typeof COUNTRIES)[number] | string;

/** Major / field-relevant cities by country. Users can still type a custom city. */
export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Argentina: ["Buenos Aires", "Córdoba", "Mendoza", "Salta", "Ushuaia"],
  Belize: ["Belize City", "Belmopan", "San Ignacio", "Punta Gorda"],
  Bolivia: ["La Paz", "Santa Cruz", "Cochabamba", "Sucre"],
  Brazil: ["Manaus", "Belém", "Brasília", "São Paulo", "Rio de Janeiro", "Cuiabá", "Campo Grande"],
  Canada: ["Toronto", "Vancouver", "Montreal", "Ottawa"],
  Chile: ["Santiago", "Valdivia", "Punta Arenas"],
  Colombia: ["Bogotá", "Medellín", "Cali", "Leticia", "Cartagena"],
  "Costa Rica": [
    "San José",
    "Puerto Jiménez",
    "Golfito",
    "Quepos",
    "Puntarenas",
    "Limón",
    "Liberia",
    "Heredia",
    "Cartago",
    "Alajuela",
  ],
  Ecuador: ["Quito", "Guayaquil", "Cuenca", "Tena", "Coca"],
  "El Salvador": ["San Salvador", "Santa Ana"],
  France: ["Paris", "Lyon", "Marseille"],
  Germany: ["Berlin", "Munich", "Hamburg"],
  Guatemala: ["Guatemala City", "Antigua", "Flores", "Petén"],
  Guyana: ["Georgetown", "Lethem"],
  Honduras: ["Tegucigalpa", "San Pedro Sula", "La Ceiba"],
  India: ["New Delhi", "Bengaluru", "Mumbai"],
  Mexico: ["Mexico City", "Cancún", "Mérida", "Oaxaca", "Guadalajara", "Campeche", "Chetumal"],
  Netherlands: ["Amsterdam", "Rotterdam", "Utrecht"],
  Nicaragua: ["Managua", "León", "Granada", "Bluefields"],
  Panama: ["Panama City", "David", "Bocas del Toro", "Santiago"],
  Paraguay: ["Asunción", "Ciudad del Este"],
  Peru: ["Lima", "Cusco", "Iquitos", "Puerto Maldonado", "Arequipa"],
  Spain: ["Madrid", "Barcelona", "Seville"],
  Suriname: ["Paramaribo"],
  "United Kingdom": ["London", "Oxford", "Cambridge", "Edinburgh"],
  "United States": ["Washington", "New York", "San Francisco", "Miami", "Austin", "Seattle", "Boston"],
  Uruguay: ["Montevideo"],
  Venezuela: ["Caracas", "Maracaibo", "Ciudad Bolívar"],
};

export function citiesForCountry(country: string): string[] {
  return CITIES_BY_COUNTRY[country] || [];
}

export function ensureCountryOption(country: string): string[] {
  const list = [...COUNTRIES] as string[];
  if (country && !list.includes(country)) list.push(country);
  return list.sort((a, b) => a.localeCompare(b));
}

export function ensureCityOption(country: string, city: string): string[] {
  const list = [...citiesForCountry(country)];
  if (city && !list.includes(city)) list.push(city);
  return list.sort((a, b) => a.localeCompare(b));
}
