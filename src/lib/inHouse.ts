/** "5 in house", and "· 1 day patient" for one who goes home at night (#607, #634). */
export const inHouseNote = (stays: { on_site?: boolean }[]) => {
  const day = stays.filter((s) => s.on_site === false).length;
  return `${stays.length - day} in house${day ? ` · ${day} day ${day === 1 ? "patient" : "patients"}` : ""}`;
};
