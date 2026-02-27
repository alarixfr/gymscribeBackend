export const validateAttendance = (data) => {
  const validStructure = {
    day1: { attended: 0, absence: 0 },
    day2: { attended: 0, absence: 0 },
    day3: { attended: 0, absence: 0 },
    day4: { attended: 0, absence: 0 },
    day5: { attended: 0, absence: 0 },
    day6: { attended: 0, absence: 0 },
    day7: { attended: 0, absence: 0 },
  };

  for (const day in validStructure) {
    if (
      !data[day] ||
      typeof data[day].attended !== "number" ||
      typeof data[day].absence !== "number" ||
      data[day].attended < 0 ||
      data[day].absence < 0 ||
      data[day].attended > 1000 ||
      data[day].absence > 1000 ||
      !Number.isInteger(data[day].attended) ||
      !Number.isInteger(data[day].absence)
    ) {
      return false;
    }
  }

  return true;
};

export const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const validatePhone = (phone) => {
  if (!phone || phone === "none") return true;
  return (
    /^[\d\s\-\+\(/)]+$/.test(phone) && phone.length > 7 && phone.length < 20
  );
};

export const validateTimezone = (tz) => {
  if (!tz) return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
