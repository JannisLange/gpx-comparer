export function normalizeTripDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('Trip details must be a JSON object.');
    error.statusCode = 400;
    throw error;
  }
  return {
    route_name: cleanEditableText(value.routeName, 'Route', 100),
    bike_setup: cleanEditableText(value.bikeSetup, 'Bike setup', 100)
  };
}

export function validateTripId(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanEditableText(value, label, maxLength) {
  if (typeof value !== 'string') {
    const error = new Error(`${label} must be text.`);
    error.statusCode = 400;
    throw error;
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    const error = new Error(`${label} must be ${maxLength} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }
  return cleaned || null;
}
