import { useEffect, useState } from "react";
import { getSelectedCityId, onSelectedCityChange } from "@/lib/city";

const useSelectedCity = () => {
  const [cityId, setCityId] = useState(getSelectedCityId());

  useEffect(() => {
    setCityId(getSelectedCityId());
    const unsubscribe = onSelectedCityChange((nextCityId) => {
      if (nextCityId) setCityId(nextCityId);
    });
    return unsubscribe;
  }, []);

  return cityId;
};

export default useSelectedCity;
