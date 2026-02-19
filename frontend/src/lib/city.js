const CITY_STORAGE_KEY = "citiconnect_selected_city_id";
const CITY_CHANGE_EVENT = "citiconnect:city-change";

export const getSelectedCityId = () => localStorage.getItem(CITY_STORAGE_KEY) || "";

export const setSelectedCityId = (cityId) => {
  if (cityId) localStorage.setItem(CITY_STORAGE_KEY, cityId);
  else localStorage.removeItem(CITY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CITY_CHANGE_EVENT, { detail: { cityId: cityId || "" } }));
};

export const onSelectedCityChange = (callback) => {
  const handler = (event) => callback(event.detail?.cityId);
  window.addEventListener(CITY_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CITY_CHANGE_EVENT, handler);
};
