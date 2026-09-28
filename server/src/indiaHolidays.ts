/**
 * India's gazetted holidays (DoPT lists for central government offices, Delhi).
 * The Leave screen offers these to tick into centre-closed days; the seed uses
 * them too. Moon-dated ones (Id, Muharram, Milad) can move a day: the admin
 * edits the day if so. Add the next year when DoPT publishes it (each July).
 */
export const indiaHolidays: { date: string; name: string }[] = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-03-21', name: 'Id-ul-Fitr' },
  { date: '2026-03-26', name: 'Ram Navami' },
  { date: '2026-03-31', name: 'Mahavir Jayanti' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Buddha Purnima' },
  { date: '2026-05-27', name: 'Id-ul-Zuha (Bakrid)' },
  { date: '2026-06-26', name: 'Muharram' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-26', name: 'Milad-un-Nabi' },
  { date: '2026-09-04', name: 'Janmashtami' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-08', name: 'Diwali' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2027-01-26', name: 'Republic Day' },
  { date: '2027-03-10', name: 'Id-ul-Fitr' },
  { date: '2027-03-23', name: 'Holi' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-04-15', name: 'Ram Navami' },
  { date: '2027-04-19', name: 'Mahavir Jayanti' },
  { date: '2027-05-17', name: 'Id-ul-Zuha (Bakrid)' },
  { date: '2027-05-20', name: 'Buddha Purnima' },
  { date: '2027-06-16', name: 'Muharram' },
  { date: '2027-08-15', name: 'Independence Day' },
  { date: '2027-08-15', name: 'Milad-un-Nabi' },
  { date: '2027-08-25', name: 'Janmashtami' },
  { date: '2027-10-02', name: 'Gandhi Jayanti' },
  { date: '2027-10-09', name: 'Dussehra' },
  { date: '2027-10-29', name: 'Diwali' },
  { date: '2027-11-14', name: 'Guru Nanak Jayanti' },
  { date: '2027-12-25', name: 'Christmas Day' },
];
