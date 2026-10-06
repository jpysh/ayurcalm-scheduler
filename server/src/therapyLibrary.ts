/**
 * The standard therapy library (#219): what a residential Ayurveda centre
 * commonly offers, with a line for the admin, the minutes a booking holds
 * (hands-on time plus the room's turnaround), how many therapists, what the
 * room needs and what the therapist brings. The demo centre is seeded from it,
 * and Therapies → Add from library imports any of it, edited first.
 * Researched Sept 2026 from Kerala centres' published treatment lists; the
 * maintainer corrects it in #219.
 */
export type LibraryTherapy = {
  name: string; description: string; minutes: number; staff: number;
  amenities: string[]; products: string[]; gender: boolean; consultation?: boolean; once?: boolean; before?: boolean;
};

const T = (name: string, description: string, minutes: number, staff: number, amenities: string[], products: string[], gender = false): LibraryTherapy =>
  ({ name, description, minutes, staff, amenities, products, gender });
const table = ['massage_table'];

export const therapyLibrary: LibraryTherapy[] = [
  T('Abhyanga', 'Full-body warm oil massage with synchronised strokes.', 75, 2, [...table, 'shower'], ['Ksheerabala oil'], true),
  T('Shirodhara', 'A steady stream of warm oil on the forehead; calms the mind, helps sleep.', 75, 1, [...table, 'shirodhara_stand'], ['Ksheerabala oil', 'Brahmi oil']),
  T('Takradhara', 'Medicated buttermilk poured on the forehead; for stress, psoriasis, insomnia.', 75, 1, [...table, 'shirodhara_stand'], ['Buttermilk', 'Amalaki']),
  T('Ksheeradhara', 'Medicated milk poured over the head or body; cooling.', 75, 1, [...table, 'dhara_stand'], ['Milk', 'Bala decoction']),
  T('Kashayadhara', 'Warm herbal decoction poured over the body; for joint pain and swelling.', 75, 2, [...table, 'dhara_stand', 'shower'], ['Dashamoola kashaya'], true),
  T('Pizhichil', 'Warm oil squeezed over the body from cloths while it is massaged.', 105, 2, [...table, 'shower'], ['Dhanwantaram oil'], true),
  T('Njavarakizhi', 'Boluses of Njavara rice cooked in milk and herbs, massaged over the body.', 105, 2, [...table, 'rice_boluses', 'shower'], ['Njavara rice', 'Milk', 'Bala decoction'], true),
  T('Elakizhi', 'Hot boluses of medicinal leaves massaged over painful joints and muscles.', 75, 2, [...table, 'shower'], ['Fresh leaves', 'Murivenna oil'], true),
  T('Podikizhi', 'Hot boluses of herbal powder; for stiffness and swelling.', 75, 2, [...table, 'shower'], ['Kolakulathadi powder'], true),
  T('Jambira Pinda Sweda', 'Hot boluses of lemon and herbs; for arthritis and sprains.', 75, 2, [...table, 'shower'], ['Lemon', 'Turmeric', 'Kottamchukkadi oil'], true),
  T('Udvartana', 'Upward massage with dry herbal powder; for weight and circulation.', 75, 2, [...table, 'herbal_paste', 'shower'], ['Triphala powder'], true),
  T('Bashpa Sweda', 'Whole-body herbal steam in a steam box after oil.', 45, 1, ['steam', 'shower'], ['Dashamoola decoction'], true),
  T('Nadi Sweda', 'Herbal steam directed at one part of the body through a tube.', 30, 1, ['steam'], ['Dashamoola decoction']),
  T('Avagaha Sweda', 'Sitting in a warm herbal decoction bath.', 60, 1, ['shower'], ['Herbal decoction'], true),
  T('Kati Vasti', 'Warm oil held on the lower back in a dough ring; for back pain.', 60, 1, [...table, 'herbal_paste'], ['Sahacharadi oil', 'Black gram flour']),
  T('Greeva Vasti', 'Warm oil held on the neck in a dough ring; for neck pain.', 60, 1, [...table, 'herbal_paste'], ['Mahanarayana oil', 'Black gram flour']),
  T('Janu Vasti', 'Warm oil held on the knee in a dough ring; for knee pain.', 60, 1, [...table, 'herbal_paste'], ['Murivenna oil', 'Black gram flour']),
  T('Hridaya Vasti', 'Warm oil held over the heart in a dough ring; calming.', 60, 1, [...table, 'herbal_paste'], ['Arjuna oil', 'Black gram flour']),
  T('Shirovasti', 'Warm oil held on the head in a leather cap; for neurological complaints.', 75, 1, [...table, 'herbal_oil'], ['Ksheerabala oil', 'Black gram flour']),
  T('Netra Tarpana', 'Medicated ghee held over the eyes; for tired and dry eyes.', 45, 1, [...table, 'herbal_paste'], ['Triphala ghee', 'Black gram flour']),
  T('Nasya', 'Medicated oil in the nose after a face massage and steam; clears the head.', 40, 1, [...table, 'steam'], ['Anu taila']),
  T('Karnapoorana', 'Warm medicated oil held in the ears.', 30, 1, table, ['Bilva oil']),
  T('Gandusha', 'Medicated oil held in the mouth; for gums and voice.', 20, 1, [], ['Sesame oil']),
  T('Kavala', 'Gargling with a herbal decoction.', 20, 1, [], ['Triphala decoction']),
  T('Mukha Lepam', 'Herbal face pack after a face massage.', 45, 1, [...table, 'herbal_paste'], ['Kumkumadi oil', 'Herbal face powder']),
  T('Lepam', 'Medicated paste on a painful or swollen joint.', 45, 1, [...table, 'herbal_paste'], ['Kottamchukkadi paste']),
  T('Talapothichil', 'Cooling herbal paste on the head, wrapped in leaves.', 60, 1, [...table, 'herbal_paste'], ['Amalaki paste', 'Buttermilk', 'Banana leaves']),
  T('Thalam', 'Medicated oil and powder on the crown of the head.', 20, 1, [], ['Kachooradi powder', 'Ksheerabala oil']),
  T('Padabhyanga', 'Foot massage with warm oil.', 40, 1, [], ['Ksheerabala oil']),
  T('Marma Massage', 'Gentle pressure on the body\'s marma points with oil.', 75, 1, [...table, 'herbal_oil'], ['Mahanarayana oil'], true),
  { ...T('Snehapana', 'A measured dose of medicated ghee taken in the morning, before a cleanse.', 20, 1, [], ['Tiktaka ghee']), before: true },
  { ...T('Vamana', 'Therapeutic vomiting under supervision, one morning of the course.', 120, 2, ['shower'], ['Madanaphala', 'Milk', 'Rock salt'], true), once: true },
  { ...T('Virechana', 'Therapeutic purgation, given in the morning and watched through the day.', 60, 1, [], ['Trivrit lehyam', 'Castor oil']), once: true },
  T('Kashaya Vasti', 'Decoction enema (Niruha), given on an empty stomach.', 60, 1, [...table, 'shower'], ['Dashamoola decoction', 'Honey', 'Rock salt'], true),
  T('Anuvasana Vasti', 'Oil enema, given after a meal.', 45, 1, [...table, 'shower'], ['Sahacharadi oil'], true),
  T('Uttara Vasti', 'Medicated oil through the urinary or genital tract; by a doctor.', 45, 1, table, ['Medicated oil'], true),
  T('Jalaukavacharana', 'Leech therapy on a local area.', 60, 1, table, ['Leeches', 'Turmeric']),
  T('Agnikarma', 'Heat applied with a metal rod to a painful point.', 45, 1, table, ['Panchadhatu rod', 'Aloe vera']),
  T('Mukhabhyanga', 'Face and head massage with oil.', 40, 1, table, ['Kumkumadi oil']),
  { ...T('Consultation', 'Pulse, BP and a talk with the doctor; the plan is reviewed.', 20, 1, ['bp_monitor', 'examination_bed'], []), consultation: true },
];
