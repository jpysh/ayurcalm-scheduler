/** "5 in house", and "· 1 day" for a day patient, who goes home (#607). */
export const inHouseNote = (stays: { on_site?: boolean }[]) => {
  const day = stays.filter((s) => s.on_site === false).length;
  return `${stays.length - day} in house${day ? ` · ${day} day` : ""}`;
};
